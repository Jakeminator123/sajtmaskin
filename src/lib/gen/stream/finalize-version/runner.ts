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
// Side-effect import: installs the default devLog-mirror subscriber so
// `preflight.summary`/`server-verify.policy` entries keep flowing into
// `generation-log-writer.ts` after the cut-over.
import "@/lib/logging/event-bus-subscribers";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import {
  OWN_ENGINE_POST_STREAM_PIPELINE,
  type OwnEnginePostStreamPhaseId,
} from "../finalize-pipeline-contract";
import { runFinalizeFastPath } from "./fast-path";
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
import type {
  FinalizeParams,
  FinalizeResult,
  FinalizeStepTelemetryMap,
} from "./types";

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
  } = params;

  const finalizePath = resolveFinalizePathPolicy({
    buildSpec,
    repairPassIndex,
    originalPrompt,
    accumulatedContent,
  });
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
  const autofixPhase = await runAutofixPrePhase({
    runAutofix,
    contentForVersion,
    chatId,
    model,
    buildSpec,
    resolvedScaffold,
    resolvedTier,
    onProgress,
    stepTelemetry: finalizeStepTelemetry,
  });
  contentForVersion = autofixPhase.contentForVersion;
  const autofixSucceeded = autofixPhase.autofixSucceeded;
  const {
    autoFixFixCount,
    autoFixWarningCount,
    autoFixDependencyCount,
    autoFixHeavyLoad,
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
  });
  contentForVersion = fastPathContent;
  Object.assign(finalizeStepTelemetry, fastPathStepTelemetry);

  // 5–6. Persist assistant + version atomically after merge/preflight.
  // When targetVersionId is set (autofix / repair), update existing version in-place
  // instead of minting a new version number.
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
      runId: `repair-${repairPassIndex}`,
      reason: "finalize-repair-pass",
      trigger: "manual",
    });
    emitBusEvent({
      t: "version.repair.passIndex",
      versionId: version.id,
      chatId,
      runId: `repair-${repairPassIndex}`,
      passIndex: repairPassIndex,
    });
  }

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
    verifierBlockingFindings,
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
  const verifierBlocked = verifierBlockingFindings.length > 0;
  const hasVerificationBlockingErrors =
    hasVerificationBlockingPreflightErrors || verifierBlocked;
  const verificationFailureSummary = verifierBlocked
    ? hasVerificationBlockingPreflightErrors
      ? `${preflightFailureSummary} Verifier reported ${verifierBlockingFindings.length} blocking finding(s).`
      : `Verifier reported ${verifierBlockingFindings.length} blocking finding(s).`
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
    runId: repairPassIndex > 0 ? `repair-${repairPassIndex}` : undefined,
    filesChecked: preflightFileCount,
    issueCount: preflightIssues.length,
    errorCount: preflightErrors.length,
    warningCount: preflightWarnings.length,
    verificationBlocked: hasVerificationBlockingErrors,
    previewBlocked: hasPreviewBlockingPreflightErrors,
    previewBlockingReason,
  });
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
    hasVerificationBlockingErrors,
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
    verifierBlockingFindings,
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

  if (hasVerificationBlockingErrors) {
    const failedVersion = await maybeFailVersionVerification({
      chatId,
      versionId: version.id,
      verificationFailureSummary,
      preflightErrorsCount: preflightErrors.length,
      verifierBlockingFindingCount: verifierBlockingFindings.length,
    });
    if (failedVersion?.id) {
      version = failedVersion;
    }
  }

  debugLog("finalize", "Finalize pipeline complete", {
    chatId,
    versionId: version.id,
    autofix: resolveStepDurationMs("autofix"),
    urlExpand: resolveStepDurationMs("url_expand"),
    syntaxValidation: resolveStepDurationMs("validate_syntax"),
    imageMaterialization: resolveStepDurationMs("materialize_images"),
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
  };
}
