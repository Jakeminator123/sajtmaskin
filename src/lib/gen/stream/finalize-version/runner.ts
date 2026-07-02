/**
 * `finalizeAndSaveVersion` — the shared post-generation pipeline:
 *   URL expansion → autofix → (fast-path: syntax, images, verifier,
 *   parse/merge/preflight) → persist assistant + version → side effects
 *   (snapshot, preflight logs, telemetry, generation log, optional
 *   verification-fail mark).
 *
 * Why URL expansion runs first: `expandUrls` rewrites `{{MEDIA_N}}`
 * aliases into real URLs, which can appear inside import paths. Running
 * autofix on aliased paths could mis-trigger import rewrites (F2 SDK
 * guard, bare-import resolver), so we expand first and then let the
 * deterministic autofix see the final import strings. The internal
 * `runAutoFix` call inside `validateAndFix` is therefore redundant on
 * this path and is suppressed via `alreadyMechanicallyFixed: true`.
 *
 * Assistant row + draft version are persisted in one DB transaction
 * (no orphan assistant if version insert fails). Steps after that
 * (preflight error logs, telemetry, generation log, verification state)
 * are best-effort: the user already has a saved version + message;
 * failures there are logged but do not roll back the version.
 *
 * Split out of `finalize-version.ts` (OMTAG-03 wave-rest) — no behavior
 * change. Phase helpers live in `./fast-path.ts`, `./verifier-phase.ts`,
 * `./preflight-phase.ts`. Post-persist side effects live in
 * `./persist-side-effects.ts`.
 */

import { debugLog } from "@/lib/utils/debug";
import { devLogAppend } from "@/lib/logging/devLog";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
import { observePhase, recordPhaseDuration } from "@/lib/observability/metrics";
// Side-effect import: installs the default devLog-mirror subscriber so
// `preflight.summary`/`server-verify.policy` entries keep flowing into
// `generation-log-writer.ts` after the cut-over.
import "@/lib/logging/event-bus-subscribers";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import {
  OWN_ENGINE_POST_STREAM_PIPELINE,
  type OwnEnginePostStreamPhaseId,
} from "../finalize-pipeline-contract";
import { postFinalizeQualityGateIncludesTypecheck } from "../post-finalize-policies";
import { hasBuildBreakingVerifierFindings } from "@/lib/gen/preview/should-start-preview";
import { runFinalizeFastPath } from "./fast-path";
import { getDossierById } from "@/lib/gen/dossiers/registry";
import { selectDossiersForRequest } from "@/lib/gen/dossiers/select";
import type { DossierEntry } from "@/lib/gen/dossiers/types";
import { resolveFinalizePathPolicy } from "./policy";
import { runAutofixPrePhase, runUrlExpandPhase } from "./pre-phases";
import {
  buildAndPersistPreflightLogs,
  maybeFailVersionVerification,
  persistGenerationLog,
  persistOrchestrationSnapshot,
  pruneStaleLogsIfCleanRepair,
} from "./persist-side-effects";
import { persistTelemetryRecord } from "./persist-telemetry";
import { buildWarmPassTelemetry } from "./warm-pass-telemetry";
import type {
  FinalizeParams,
  FinalizeResult,
  FinalizeStepTelemetryMap,
} from "./types";

function normalizeCapabilityIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0) return [];
  return Array.from(
    new Set(
      input
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function normalizeDossierIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0) return [];
  return Array.from(
    new Set(
      input
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function mapSyntaxResultToBusPhase(params: {
  status: string;
  fixerUsed: boolean;
  earlyStopReason?: string | null;
}): "fixed" | "invalid" | "gave_up" | "ok" {
  const { status, fixerUsed, earlyStopReason } = params;
  if (status === "passed") return fixerUsed ? "fixed" : "ok";
  if (status === "partial") return "fixed";
  if (earlyStopReason) return "gave_up";
  return "invalid";
}

function resolveRequestedCapabilitiesFromStreamMeta(
  streamMeta: Record<string, unknown> | null | undefined,
): string[] {
  const fromTopLevel = normalizeCapabilityIds(streamMeta?.requestedCapabilities);
  const briefSummary =
    streamMeta?.briefSummary &&
    typeof streamMeta.briefSummary === "object" &&
    !Array.isArray(streamMeta.briefSummary)
      ? (streamMeta.briefSummary as Record<string, unknown>)
      : null;
  const fromBriefSummary = normalizeCapabilityIds(briefSummary?.requestedCapabilities);
  const explicitCapabilities = Array.from(
    new Set([...fromBriefSummary, ...fromTopLevel]),
  );
  if (explicitCapabilities.length > 0) return explicitCapabilities;

  const inferredCapabilities =
    streamMeta?.capabilities &&
    typeof streamMeta.capabilities === "object" &&
    !Array.isArray(streamMeta.capabilities)
      ? (streamMeta.capabilities as Record<string, unknown>)
      : null;
  if (inferredCapabilities?.needs3D === true) {
    return ["visual-3d"];
  }
  return [];
}

/**
 * Wave 6 verbatim-restore: resolve the dossiers selected by orchestration so
 * verbatim-policy can protect Stripe/Clerk-glue from LLM rewrites at merge.
 *
 * Primary path: `selectedDossierIds` from orchestration meta. Legacy fallback:
 * replay the older requested-capabilities metadata so old streams/evals still
 * get best-effort protection.
 */
export function resolveSelectedDossiersFromStreamMeta(
  streamMeta: Record<string, unknown> | null | undefined,
): DossierEntry[] {
  const explicitDossierIds = normalizeDossierIds(streamMeta?.selectedDossierIds);
  if (explicitDossierIds.length > 0) {
    const selected = explicitDossierIds
      .map((id) => getDossierById(id))
      .filter((entry): entry is DossierEntry => entry !== null);
    if (selected.length > 0) return selected;
  }

  const capabilities = resolveRequestedCapabilitiesFromStreamMeta(streamMeta);
  if (capabilities.length === 0) return [];
  try {
    const selection = selectDossiersForRequest({ requestedCapabilities: capabilities });
    return selection.selected.map((s) => s.entry);
  } catch (err) {
    console.warn("[finalize] resolveSelectedDossiersFromStreamMeta failed:", err);
    // Telemetri: tyst-fail till [] gör att verbatim-policy de facto blir
    // avstängd för denna körning. Operativt vill vi spåra om det blir vanligt.
    devLogAppend("in-progress", {
      type: "verbatim_policy_dossier_resolution_failed",
      capabilitiesCount: capabilities.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export async function finalizeAndSaveVersion(
  params: FinalizeParams,
): Promise<FinalizeResult> {
  const finalizePipelineStartedAt = Date.now();
  const {
    accumulatedContent,
    chatId,
    model,
    resolvedTier,
    originalPrompt,
    buildIntent,
    buildSpec,
    routePlan,
    orchestrationContract,
    resolvedScaffold,
    urlMap,
    startedAt,
    runAutofix = true,
    tokenUsage,
    logNote,
    previousFiles,
    onProgress,
    orchestrationStreamMeta,
    repairPassIndex = 0,
    lineageHash,
    targetVersionId,
    lifecycleParentVersionId,
    willRunQualityGate = false,
    qualityGatePlanned = false,
  } = params;
  const requestedCapabilities = resolveRequestedCapabilitiesFromStreamMeta(
    orchestrationStreamMeta as Record<string, unknown> | null | undefined,
  );
  // Read the orchestrate-locked variantId off the stream meta so the
  // autofix pre-phase can materialize the variant's first fontPairing
  // into the baseline `app/layout.tsx`. Falls back to null when meta
  // does not carry a variant (legacy snapshots, eval, repair-only).
  const orchestrationVariantId =
    typeof orchestrationStreamMeta?.variantId === "string" &&
    orchestrationStreamMeta.variantId.trim().length > 0
      ? (orchestrationStreamMeta.variantId as string)
      : null;

  const finalizePath = resolveFinalizePathPolicy({
    buildSpec,
    repairPassIndex,
    originalPrompt,
    accumulatedContent,
  });
  const latencyBudgetKind: "init" | "followup" =
    buildSpec?.generationMode === "followUp" || Boolean(targetVersionId)
      ? "followup"
      : "init";
  const repairScopeId = [
    targetVersionId ?? lineageHash ?? chatId,
    repairPassIndex > 0 ? `repair-${repairPassIndex}` : "root",
  ].join(":");
  let telemetryRecordId: string | null = null;
  const finalizeStepTelemetry: FinalizeStepTelemetryMap = {};
  const resolveStepDurationMs = (step: OwnEnginePostStreamPhaseId): number => {
    const duration = finalizeStepTelemetry[step]?.durationMs;
    return typeof duration === "number" && Number.isFinite(duration) ? duration : 0;
  };

  devLogAppend("in-progress", {
    type: "finalize.pipeline",
    chatId,
    phases: OWN_ENGINE_POST_STREAM_PIPELINE.map((p) => p.id),
    repairPassIndex,
    finalizePath: finalizePath.runDeepPath ? "full" : "light",
    finalizePathReason: finalizePath.reason,
  });
  recordPhaseDuration(
    "codegen",
    Math.max(0, finalizePipelineStartedAt - startedAt),
    { kind: latencyBudgetKind },
  );

  // 1. URL expansion — runs before autofix so {{MEDIA_N}} aliases inside
  // import paths are rewritten to real URLs before any deterministic
  // import rewriting (F2 SDK guard, bare-import resolver) inspects them.
  let contentForVersion = runUrlExpandPhase({
    accumulatedContent,
    urlMap,
    onProgress,
    stepTelemetry: finalizeStepTelemetry,
  });

  // 2. Autofix — operates on URL-expanded content.
  // idempotent: validateAndFix downstream is told to skip its initial mechanical
  // pass (alreadyMechanicallyFixed: true) since nothing between here and there
  // mutates contentForVersion.
  const autofixPhase = await observePhase(
    { phase: "autofix", kind: latencyBudgetKind },
    () =>
      runAutofixPrePhase({
        runAutofix,
        contentForVersion,
        chatId,
        model,
        requestedCapabilities,
        buildSpec,
        resolvedScaffold,
        resolvedTier,
        variantId: orchestrationVariantId,
        onProgress,
        stepTelemetry: finalizeStepTelemetry,
      }),
  );
  contentForVersion = autofixPhase.contentForVersion;
  const autofixSucceeded = autofixPhase.autofixSucceeded;
  const {
    autoFixOutcome,
    autoFixFixCount,
    autoFixWarningCount,
    autoFixDependencyCount,
    autoFixHeavyLoad,
    autoFixFixers,
    previewBlockingWarnings,
  } = autofixPhase;

  // 3–4. Fast path: validate syntax → materialize images → verifier →
  // parse/merge/preflight (with scaffold-retry + partial-file repair).
  const {
    contentForVersion: fastPathContent,
    syntaxResult,
    filesJson,
    preflightResult,
    preflightIssues,
    preflightFileCount,
    previewBlockingReason,
    finalizedFilesForPreview,
    scaffoldRetry,
    verifierBlockingFindings,
    rejectedShrinks,
    rejectedStructural,
    crossFileStubs,
    stepTelemetry: fastPathStepTelemetry,
  } = await runFinalizeFastPath({
    chatId,
    model,
    resolvedTier,
    originalPrompt,
    buildIntent,
    buildSpec,
    resolvedScaffold,
    routePlan,
    orchestrationContract,
    previousFiles,
    onProgress,
    contentForVersion,
    finalizePath,
    repairPassIndex,
    alreadyMechanicallyFixed: autofixSucceeded,
    autoFixHeavyLoad,
    willRunQualityGate,
    qualityGateChecksIncludesTypecheck:
      willRunQualityGate && postFinalizeQualityGateIncludesTypecheck(buildSpec),
    // Wave 7 R2 guard: stark signal för warm-tsc-skip. Utan denna = kör
    // warm-tsc ändå. Se fast-path.ts för motivering.
    qualityGatePlanned,
    // Wave 6 verbatim-restore — tråda in faktiska valda dossiers så
    // applyDossierVerbatimPolicy kan skydda Stripe/Clerk/Sentry-glue
    // från tyst korruption när LLM omformar verbatim-filer.
    selectedDossiers: resolveSelectedDossiersFromStreamMeta(
      orchestrationStreamMeta as Record<string, unknown> | null | undefined,
    ),
    repairScopeId,
  });
  contentForVersion = fastPathContent;
  const effectiveVerifierBlockingFindings = [
    ...previewBlockingWarnings.map((warning) => ({
      id: "autofix-preview-blocking",
      detail: warning,
    })),
    ...verifierBlockingFindings,
  ];
  Object.assign(finalizeStepTelemetry, fastPathStepTelemetry);
  recordPhaseDuration("syntax-validate", resolveStepDurationMs("validate_syntax"), {
    kind: latencyBudgetKind,
  });
  recordPhaseDuration("preflight", resolveStepDurationMs("parse_merge_preflight"), {
    kind: latencyBudgetKind,
  });

  // 5–6. Persist assistant + version atomically after merge/preflight.
  // When targetVersionId is set (autofix / repair), update existing version in-place
  // instead of minting a new version number.
  const persistStartedAt = Date.now();
  const thinkingForPersist =
    typeof params.accumulatedThinking === "string" && params.accumulatedThinking.length > 0
      ? params.accumulatedThinking
      : null;
  const { message: assistantMsg, version: initialVersion } = targetVersionId
    ? await chatRepo.addAssistantMessageAndUpdateExistingVersion(
        chatId,
        targetVersionId,
        contentForVersion,
        filesJson,
        { thinking: thinkingForPersist },
      )
    : await chatRepo.addAssistantMessageAndCreateDraftVersion(chatId, contentForVersion, filesJson, {
        lifecycleStage: buildSpec?.previewPolicy === "fidelity3" ? "integrations" : "design",
        parentVersionId: lifecycleParentVersionId ?? null,
        thinking: thinkingForPersist,
      });
  let version = initialVersion;
  const finalizeRunId = repairPassIndex > 0 ? `repair-${repairPassIndex}` : undefined;
  devLogAppend("in-progress", {
    type: "version.created",
    chatId,
    versionId: version.id,
    repairPassIndex,
    lineageHash: lineageHash ?? null,
  });

  // OMTAG-06: stamp a run on the bus. The first pass uses the default
  // `root` run; every repair pass gets a distinct runId so the
  // per-version `.runs.json` index can list them in order. This is
  // also what fixes the old "2 events in repair vs 30 in original"
  // flush-bug — every event now lives under a stable run folder.
  if (repairPassIndex === 0) {
    emitBusEvent({
      t: "version.started",
      versionId: version.id,
      chatId,
      generationKind: targetVersionId ? "followup" : "create",
      model,
      scaffoldId: resolvedScaffold?.id ?? null,
    });
  } else {
    emitBusEvent({
      t: "version.repair.started",
      versionId: version.id,
      chatId,
      runId: finalizeRunId,
      reason: "finalize-repair-pass",
      trigger: "manual",
    });
    emitBusEvent({
      t: "version.repair.passIndex",
      versionId: version.id,
      chatId,
      runId: finalizeRunId,
      passIndex: repairPassIndex,
    });
  }

  emitBusEvent({
    t: "version.autofix.result",
    versionId: version.id,
    chatId,
    runId: finalizeRunId,
    fixes: autoFixFixCount,
    warnings: autoFixWarningCount,
    dependencies: autoFixDependencyCount,
    outcome: autoFixOutcome,
    heavyLoad: autoFixHeavyLoad,
    previewBlockingWarnings: previewBlockingWarnings.length,
    fixers: autoFixFixers,
  });
  emitBusEvent({
    t: "version.syntax.pass",
    versionId: version.id,
    chatId,
    runId: finalizeRunId,
    pass: syntaxResult.passes,
    errors: syntaxResult.errorsAfter,
    phase: mapSyntaxResultToBusPhase({
      status: syntaxResult.status,
      fixerUsed: syntaxResult.fixerUsed,
      earlyStopReason: syntaxResult.earlyStopReason,
    }),
    result: syntaxResult.status,
    fixerUsed: syntaxResult.fixerUsed,
    fixerImproved: syntaxResult.fixerImproved,
    mechanicalFixes: syntaxResult.mechanicalFixCount,
    llmFixes: syntaxResult.llmFixCount,
    tscRan: syntaxResult.tsc?.ran === true,
    eslintRan: syntaxResult.eslint?.ran === true,
  });

  await persistOrchestrationSnapshot({
    chatId,
    versionId: version.id,
    orchestrationStreamMeta,
    lineageHash,
    buildIntent,
  });

  const scaffoldSelection =
    orchestrationStreamMeta?.scaffoldSelection &&
    typeof orchestrationStreamMeta.scaffoldSelection === "object"
      ? (orchestrationStreamMeta.scaffoldSelection as Record<string, unknown>)
      : null;

  const {
    preflightErrors,
    preflightWarnings,
    hasVerificationBlockingPreflightErrors,
    hasPreviewBlockingPreflightErrors,
    preflightFailureSummary,
  } = await buildAndPersistPreflightLogs({
    chatId,
    versionId: version.id,
    preflightIssues,
    preflightFileCount,
    previewBlockingReason,
    previewStart: preflightResult.previewStart,
    finalizedPreviewFileCount: finalizedFilesForPreview.length,
    scaffoldRetry,
    routePlan,
    scaffoldSelection,
    syntaxResult,
    verifierBlockingFindings: effectiveVerifierBlockingFindings,
    repairPassIndex,
    lineageHash,
    autoFixHeavyLoad,
    autoFixFixCount,
    autoFixWarningCount,
    autoFixDependencyCount,
  });

  // Verifier-blocking findings need to actually gate the version. The
  // preflight bundle only knows about preflight errors, so we OR the verifier
  // signal in here and use the effective flag for telemetry, generation log
  // status, and `failVersionVerification` below.
  //
  // `verifierBlocked` stays the RAW "verifier produced >= 1 blocking finding"
  // signal — it still drives telemetry meta (`preflight.verifierBlocked` + the
  // finding count) and the advisory `quality-gate:verifier-blocking` logs, so
  // the verifier signal is never lost for analytics.
  //
  // What it must NOT do in F2 (design preview) is terminally fail a version
  // that renders fine just because the verifier flagged a product-quality
  // issue (e.g. `navigation-placeholder-actions`, `footer-dead-links`). Prod
  // (us-east) showed visually-OK F2 previews ending up `failed` via the
  // `diagnosticOnly` server-verify path purely from these advisory findings
  // (M#vf2). So in F2 only the render-dead / build-breaking class
  // (`undefined-jsx-symbol`, `build-breaking-missing-imports`,
  // `autofix-preview-blocking`, `TS2304/2307/2552`, ...) — already encoded in
  // `isBuildBreakingFinding` (`should-start-preview.ts`) — may gate
  // verification. F3 (integrations) stays strict: every verifier blocking
  // finding gates the row.
  const verifierBlocked = effectiveVerifierBlockingFindings.length > 0;
  const verifierGatesVerification =
    buildSpec?.previewPolicy === "fidelity3"
      ? verifierBlocked
      : hasBuildBreakingVerifierFindings(effectiveVerifierBlockingFindings);
  const hasCurrentPreflightBlockers =
    preflightErrors.length > 0 || syntaxResult.status === "failed";
  const hasVerificationBlockingErrors =
    hasVerificationBlockingPreflightErrors || verifierGatesVerification;
  const verificationFailureSummary = verifierBlocked
    ? hasVerificationBlockingPreflightErrors
      ? `${preflightFailureSummary} Verifier reported ${effectiveVerifierBlockingFindings.length} blocking finding(s).`
      : `Verifier reported ${effectiveVerifierBlockingFindings.length} blocking finding(s).`
    : preflightFailureSummary;

  // OMTAG-06: preflight.summary now flows through the single-writer
  // event bus. The devLog-mirror subscriber (installed via the side-
  // effect import at the top of this file) re-emits the legacy
  // `preflight.summary` row for backward compat with
  // `generation-log-writer.ts` / backoffice.
  emitBusEvent({
    t: "version.preflight",
    versionId: version.id,
    chatId,
    runId: finalizeRunId,
    filesChecked: preflightFileCount,
    issueCount: preflightIssues.length,
    errorCount: preflightErrors.length,
    warningCount: preflightWarnings.length,
    verificationBlocked: hasVerificationBlockingErrors,
    previewBlocked: hasPreviewBlockingPreflightErrors,
    previewBlockingReason,
  });
  emitBusEvent({
    t: "version.saved",
    versionId: version.id,
    chatId,
    runId: finalizeRunId,
    previewBlocked: hasPreviewBlockingPreflightErrors,
    verificationBlocked: hasVerificationBlockingErrors,
    messageId: assistantMsg.id,
  });
  if (finalizeStepTelemetry.verifier?.reason === "autofix_heavy_load") {
    emitBusEvent({
      t: "version.degraded",
      versionId: version.id,
      chatId,
      runId: finalizeRunId,
      kind: "verifier_skipped_heavy_load",
      message:
        "Verifiering hoppades över eftersom mekanisk autofix behövde göra ovanligt många ändringar.",
      meta: {
        fixCount: autoFixFixCount,
        threshold: 5,
        repairPassIndex,
      },
    });
  }
  // Retain the richer `verifierBlocked` / `scaffoldRetry` context in
  // devLog as a separate diagnostic entry — the projection doesn't
  // need it but the backoffice "Autofix & Kvalitet" panel reads it.
  // Deliberately named `preflight.details` (not `preflight.summary.*`)
  // so the acceptance-criteria grep for "preflight\.summary" stays
  // restricted to the legacy writer + legacy readers only.
  devLogAppend("in-progress", {
    type: "preflight.details",
    chatId,
    versionId: version.id,
    verifierBlocked,
    scaffoldRetry,
    scaffoldSelection,
  });
  onProgress?.("parse_merge_preflight", {
    phase: "done",
    durationMs: resolveStepDurationMs("parse_merge_preflight"),
    versionId: version.id,
    fileCount: preflightFileCount,
    issueCount: preflightIssues.length,
    verificationBlocked: hasVerificationBlockingErrors,
    previewBlocked: hasPreviewBlockingPreflightErrors,
  });

  await pruneStaleLogsIfCleanRepair({
    chatId,
    versionId: version.id,
    repairPassIndex,
    hasCurrentPreflightBlockers,
  });

  telemetryRecordId = await persistTelemetryRecord({
    chatId,
    versionId: version.id,
    resolvedScaffold,
    scaffoldSelection,
    model,
    buildIntent,
    repairPassIndex,
    runAutofix,
    syntaxResult,
    preflightErrors,
    preflightWarnings,
    hasPreviewBlockingPreflightErrors,
    hasVerificationBlockingErrors,
    // SAJ-59: explicit so persist-telemetry can distinguish preflight-block
    // from verifier-only-block when populating `qualityGateResult`.
    hasPreflightVerificationErrors: hasVerificationBlockingPreflightErrors,
    previewBlockingReason,
    startedAt,
    tokenUsage,
    preflightFileCount,
    scaffoldRetry,
    finalizePath,
    finalizeStepTelemetry,
    autoFixFixCount,
    autoFixWarningCount,
    autoFixDependencyCount,
    autoFixHeavyLoad,
    verifierBlocked,
    verifierBlockingFindings: effectiveVerifierBlockingFindings,
    preflightIssueCount: preflightIssues.length,
    finalizedPreviewFileCount: finalizedFilesForPreview.length,
    unresolvedImportFallbackUsed: preflightResult.unresolvedImportFallbackUsed,
    buildSpec,
    resolvedTier,
    orchestrationStreamMeta,
  });

  // 7. Log generation
  await persistGenerationLog({
    chatId,
    versionId: version.id,
    model,
    tokenUsage,
    startedAt,
    hasVerificationBlockingErrors,
    verificationFailureSummary,
    logNote,
  });

  // 2026-04-23 (showcase-bug rootfix, fas D1): only pre-commit `failed` for
  // preflight hard errors (syntax/parse/merge) — those are deterministic.
  // Verifier-LLM blocking findings alone do NOT pre-commit: server-verify
  // (with its real tsc+build) is the authority on terminal verification
  // state. This prevents the "Fel"-badge from appearing before server-verify
  // has actually confirmed anything. See docs/architecture/runtime-contracts.md (§ Versionstatus och event-bus).
  if (hasVerificationBlockingPreflightErrors) {
    const failedVersion = await maybeFailVersionVerification({
      chatId,
      versionId: version.id,
      verificationFailureSummary,
      preflightErrorsCount: preflightErrors.length,
      verifierBlockingFindingCount: effectiveVerifierBlockingFindings.length,
    });
    if (failedVersion?.id) {
      version = failedVersion;
    }
  } else if (verifierGatesVerification) {
    // Only log "pending server-verify" when the verifier signal actually gates
    // this version (F3, or F2 with a build-breaking finding). A pure F2
    // product-quality finding is advisory: it is still recorded in telemetry
    // and the `quality-gate:verifier-blocking` log, but no server-verify is
    // scheduled for it, so claiming "pending server-verify" here would be
    // misleading.
    devLogAppend("in-progress", {
      type: "preflight.version.verifier-blocked-pending-server-verify",
      chatId,
      versionId: version.id,
      verifierBlockingFindingCount: effectiveVerifierBlockingFindings.length,
    });
  }
  recordPhaseDuration("persist", Math.max(0, Date.now() - persistStartedAt), {
    kind: latencyBudgetKind,
  });

  debugLog("finalize", "Finalize pipeline complete", {
    chatId,
    versionId: version.id,
    autofix: resolveStepDurationMs("autofix"),
    urlExpand: resolveStepDurationMs("url_expand"),
    syntaxValidation: resolveStepDurationMs("validate_syntax"),
    imageMaterializationMs: resolveStepDurationMs("materialize_images"),
    verifier: resolveStepDurationMs("verifier"),
    parseMergePreflight: resolveStepDurationMs("parse_merge_preflight"),
    totalMs: Math.max(0, Date.now() - finalizePipelineStartedAt),
  });

  debugLog("engine", "Version saved via finalizeAndSaveVersion", {
    chatId,
    versionId: version.id,
    contentLen: contentForVersion.length,
    scaffold: resolvedScaffold?.id ?? null,
    previewBlocked: hasPreviewBlockingPreflightErrors,
    verificationBlocked: hasVerificationBlockingErrors,
    verifierBlocked,
  });

  return {
    version,
    messageId: assistantMsg.id,
    telemetryRecordId,
    previewUrl: null,
    tier2PreviewUrl: null,
    filesJson,
    contentForVersion,
    preflight: {
      verificationBlocked: hasVerificationBlockingErrors,
      previewBlocked: hasPreviewBlockingPreflightErrors,
      issueCount: preflightIssues.length,
      errorCount: preflightErrors.length,
      warningCount: preflightWarnings.length,
      previewBlockingReason,
      primaryPreviewTarget: preflightResult.previewStart.primaryPreviewTarget,
      issueCategories: [...new Set(preflightIssues.map((issue) => issue.category))],
      previewStart: preflightResult.previewStart,
      scaffoldRetry,
      routePlan,
    },
    rejectedShrinks: rejectedShrinks ?? [],
    rejectedStructural: rejectedStructural ?? [],
    crossFileStubs: crossFileStubs ?? [],
    verifierBlockingFindings: effectiveVerifierBlockingFindings ?? [],
    warmTscSkipped: syntaxResult.tsc?.ran === false && syntaxResult.tsc.skipped === "quality_gate_planned",
    ...buildWarmPassTelemetry({
      tsc: syntaxResult.tsc,
      eslint: syntaxResult.eslint,
      scaffoldId: resolvedScaffold?.id ?? null,
      isFidelity3: buildSpec?.previewPolicy === "fidelity3",
    }),
    ...(requestedCapabilities.length > 0 ? { requestedCapabilities } : {}),
  };
}
