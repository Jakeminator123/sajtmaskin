import type { BuildIntent } from "@/lib/builder/build-intent";
import type { BuildSpec } from "@/lib/gen/build-spec";
import { FEATURES } from "@/lib/config";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { validateAndFix } from "@/lib/gen/autofix/validate-and-fix";
import { expandUrls } from "@/lib/gen/url-compress";
import type { PreviewPreflightSummary } from "@/lib/gen/preview/diagnostics";
import { materializeImages } from "@/lib/gen/post-process/image-materializer";
import type { CodeFile } from "@/lib/gen/parser";
import type { RoutePlan } from "@/lib/gen/route-plan";
import {
  inferScaffoldRetrySuggestion,
  type ScaffoldRetrySuggestion,
} from "@/lib/gen/scaffolds/scaffold-aware-retry";
import { parseFilesFromContent } from "@/lib/gen/version-manager";
import { runPolishPass, isPolishPassEnabled } from "@/lib/gen/polish-pass";
import { isVerifierPassEnabled, runVerifierPass } from "@/lib/gen/verifier-pass";
import { resolvePostGenerationPolishConfig } from "@/lib/gen/post-generation-config";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import { createGenerationTelemetryRecord } from "@/lib/db/services/generation-telemetry";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { getPhaseRoutingSummary } from "@/lib/models/phase-routing";
import { isCanonicalModelId, type CanonicalModelId } from "@/lib/models/catalog";
import { devLogAppend } from "@/lib/logging/devLog";
import { debugLog, warnLog } from "@/lib/utils/debug";
import { buildFinalizePreflightLogBundle } from "./finalize-preflight-logs";
import {
  type FinalizePreflightIssue,
  runFinalizePreflight,
} from "./finalize-preflight";
import { mergeGeneratedProjectFiles } from "./finalize-merge";
import { injectIntegrationManifestIntoFilesJson } from "@/lib/integrations/inject-integration-manifest";
import {
  buildPersistedOrchestrationSnapshot,
  mergePersistedOrchestrationSnapshots,
} from "@/lib/gen/orchestration-snapshot";
import {
  OWN_ENGINE_POST_STREAM_PIPELINE,
  type OwnEnginePostStreamPhaseId,
} from "./finalize-pipeline-contract";

export type FinalizeProgressCallback = (
  step: OwnEnginePostStreamPhaseId,
  data: Record<string, unknown>,
) => void;

export interface FinalizeParams {
  accumulatedContent: string;
  chatId: string;
  model: string;
  resolvedTier?: CanonicalModelId;
  originalPrompt?: string;
  buildIntent?: BuildIntent;
  buildSpec?: BuildSpec | null;
  routePlan?: RoutePlan | null;
  resolvedScaffold: ScaffoldManifest | null;
  urlMap: Record<string, string>;
  startedAt: number;
  runAutofix?: boolean;
  tokenUsage?: { prompt?: number; completion?: number };
  logNote?: string;
  /** For follow-up: merge generated files against previous version instead of scaffold base */
  previousFiles?: CodeFile[];
  /** Optional callback for emitting progress SSE events during finalization */
  onProgress?: FinalizeProgressCallback;
  /** SSE `meta` from own-engine stream — persisted on chat after save (K-019). */
  orchestrationStreamMeta?: Record<string, unknown> | null;
  /** 0 = first generation, 1+ = quality-gate-triggered repair pass. */
  repairPassIndex?: number;
  /** SHA-256 of deterministic generation inputs (prompt lineage). */
  lineageHash?: string | null;
}

export interface FinalizeResult {
  version: Awaited<ReturnType<typeof chatRepo.createDraftVersion>>;
  messageId: string;
  telemetryRecordId: string | null;
  previewUrl: string | null;
  /** Sandbox URL when full Next.js preview is started (null until sandbox boots). */
  sandboxUrl: string | null;
  filesJson: string;
  contentForVersion: string;
  preflight: PreviewPreflightSummary;
}

interface FinalizePathPolicy {
  runDeepPath: boolean;
  reason:
    | "default"
    | "fast_path_disabled_by_flag"
    | "repair_pass"
    | "light_followup_fast_policy";
}

type FinalizeStepStatus = "done" | "skipped" | "error";

type FinalizeStepTelemetry = {
  status: FinalizeStepStatus;
  durationMs: number;
  reason?: string;
} & Record<string, unknown>;

type FinalizeStepTelemetryMap = Partial<Record<OwnEnginePostStreamPhaseId, FinalizeStepTelemetry>>;

type FinalizeSyntaxResult = Awaited<ReturnType<typeof validateAndFix>>;
type FinalizePreflightResult = Awaited<ReturnType<typeof runFinalizePreflight>>;

interface FinalizeDeepPathResult {
  contentForVersion: string;
  stepTelemetry: FinalizeStepTelemetryMap;
}

interface FinalizeFastPathResult {
  contentForVersion: string;
  syntaxResult: FinalizeSyntaxResult;
  filesJson: string;
  preflightResult: FinalizePreflightResult;
  preflightIssues: FinalizePreflightIssue[];
  preflightFileCount: number;
  previewBlockingReason: string | null;
  finalizedFilesForPreview: CodeFile[];
  scaffoldRetry: ScaffoldRetrySuggestion | null;
  stepTelemetry: FinalizeStepTelemetryMap;
}

function createFinalizeStepTelemetry(
  startedAtMs: number,
  status: FinalizeStepStatus,
  extra?: Record<string, unknown>,
): FinalizeStepTelemetry {
  return {
    status,
    durationMs: Math.max(0, Date.now() - startedAtMs),
    ...(extra ?? {}),
  };
}

const BRACKET_PLACEHOLDER_RE = /\[[^\]\n]{2,80}\]/;
const GENERIC_PLACEHOLDER_COPY_RE =
  /\b(lorem ipsum|coming soon|your company|your brand|your business|placeholder text)\b/i;

function hasLikelyPolishSignal(content: string): boolean {
  return BRACKET_PLACEHOLDER_RE.test(content) || GENERIC_PLACEHOLDER_COPY_RE.test(content);
}

function resolvePolishPassPolicy(params: {
  buildSpec?: BuildSpec | null;
  finalizePath: FinalizePathPolicy;
  repairPassIndex: number;
  verifierPolishCandidates: string[];
  contentForVersion: string;
}): { run: boolean; reason: string } {
  const { buildSpec, finalizePath, repairPassIndex, verifierPolishCandidates, contentForVersion } =
    params;

  if (!finalizePath.runDeepPath) {
    return { run: false, reason: finalizePath.reason };
  }
  if (repairPassIndex > 0) {
    return { run: false, reason: "repair_pass" };
  }
  if (!isPolishPassEnabled()) {
    return { run: false, reason: "disabled" };
  }
  if (verifierPolishCandidates.length > 0) {
    return { run: true, reason: "verifier_candidates" };
  }
  if (hasLikelyPolishSignal(contentForVersion)) {
    return { run: true, reason: "placeholder_signal" };
  }
  if (buildSpec?.generationMode === "init" && buildSpec.qualityTarget !== "standard") {
    return { run: true, reason: "high_quality_init" };
  }
  return { run: false, reason: "no_polish_signal" };
}

function resolveImageMaterializationLimit(buildSpec?: BuildSpec | null): number {
  if (!buildSpec) return 3;
  if (
    buildSpec.previewPolicy === "fidelity3" ||
    buildSpec.qualityTarget === "release-candidate"
  ) {
    return 6;
  }
  if (
    buildSpec.qualityTarget !== "standard" ||
    buildSpec.buildIntent === "app" ||
    buildSpec.contextPolicy === "heavy" ||
    buildSpec.changeScope === "integration"
  ) {
    return 4;
  }
  return 2;
}

function resolveVerifierPassPolicy(params: {
  buildSpec?: BuildSpec | null;
  finalizePath: FinalizePathPolicy;
  repairPassIndex: number;
}): { run: boolean; reason: string } {
  const { buildSpec, finalizePath, repairPassIndex } = params;

  if (!finalizePath.runDeepPath) {
    return { run: false, reason: finalizePath.reason };
  }
  if (repairPassIndex > 0) {
    return { run: false, reason: "repair_pass" };
  }
  if (!isVerifierPassEnabled()) {
    return { run: false, reason: "disabled" };
  }
  if (!buildSpec) {
    return { run: true, reason: "missing_build_spec" };
  }
  if (buildSpec.verificationPolicy === "strict") {
    return { run: true, reason: "strict_policy" };
  }
  if (buildSpec.qualityTarget !== "standard") {
    return { run: true, reason: "high_quality_target" };
  }
  if (buildSpec.buildIntent === "app") {
    return { run: true, reason: "app_intent" };
  }
  if (buildSpec.contextPolicy === "heavy") {
    return { run: true, reason: "heavy_context" };
  }
  if (buildSpec.changeScope === "integration" || buildSpec.changeScope === "page-addition") {
    return { run: true, reason: "high_risk_change_scope" };
  }
  if (buildSpec.generationMode === "followUp" && buildSpec.changeScope === "redesign") {
    return { run: true, reason: "followup_redesign" };
  }
  return { run: false, reason: "no_verifier_signal" };
}

export class EmptyGenerationError extends Error {
  readonly chatId: string;
  readonly scaffoldId: string | null;

  constructor(chatId: string, scaffoldId: string | null) {
    super("Generation produced no code output");
    this.name = "EmptyGenerationError";
    this.chatId = chatId;
    this.scaffoldId = scaffoldId;
  }
}

function resolveFinalizePathPolicy(params: {
  buildSpec?: BuildSpec | null;
  repairPassIndex: number;
}): FinalizePathPolicy {
  const { buildSpec, repairPassIndex } = params;
  if (!FEATURES.useFinalizeDeepPath) {
    // Historical env naming: false here disables the light fast-path shortcut
    // and keeps finalize on the deep path for every run.
    return { runDeepPath: true, reason: "fast_path_disabled_by_flag" };
  }
  if (repairPassIndex > 0) {
    return { runDeepPath: true, reason: "repair_pass" };
  }
  const isLightFollowUp =
    buildSpec?.generationMode === "followUp" &&
    buildSpec?.verificationPolicy === "fast" &&
    buildSpec?.contextPolicy === "light" &&
    (buildSpec?.changeScope === "copy" || buildSpec?.changeScope === "local-layout");
  if (isLightFollowUp) {
    return { runDeepPath: false, reason: "light_followup_fast_policy" };
  }
  return { runDeepPath: true, reason: "default" };
}

function ensureNonEmptyGenerationContent(params: {
  contentForVersion: string;
  chatId: string;
  resolvedScaffold: ScaffoldManifest | null;
  previousFiles?: CodeFile[];
  stage: "before_validation" | "after_validation";
}): void {
  const { contentForVersion, chatId, resolvedScaffold, previousFiles, stage } = params;
  if (contentForVersion.trim()) return;
  warnLog(
    "engine",
    stage === "before_validation"
      ? "Skipping empty generation output"
      : "Skipping empty generation output after validation",
    {
      chatId,
      scaffold: resolvedScaffold?.id ?? null,
      hadPreviousFiles: Boolean(previousFiles && previousFiles.length > 0),
    },
  );
  throw new EmptyGenerationError(chatId, resolvedScaffold?.id ?? null);
}

async function runFinalizeDeepPath(params: {
  chatId: string;
  model: string;
  buildSpec?: BuildSpec | null;
  repairPassIndex: number;
  onProgress?: FinalizeProgressCallback;
  contentForVersion: string;
  finalizePath: FinalizePathPolicy;
}): Promise<FinalizeDeepPathResult> {
  const {
    chatId,
    model,
    buildSpec,
    repairPassIndex,
    onProgress,
    finalizePath,
  } = params;
  let contentForVersion = params.contentForVersion;
  const stepTelemetry: FinalizeStepTelemetryMap = {};

  if (finalizePath.runDeepPath) {
    const stepStartedAt = Date.now();
    const maxReplacements = resolveImageMaterializationLimit(buildSpec);
    onProgress?.("materialize_images", { phase: "start" });
    try {
      const imgResult = await materializeImages(contentForVersion, { maxReplacements });
      if (imgResult.replacedCount > 0) {
        contentForVersion = imgResult.content;
        devLogAppend("in-progress", {
          type: "image-materialization",
          chatId,
          replacedCount: imgResult.replacedCount,
          skippedCount: imgResult.skippedCount,
          queries: imgResult.queries.slice(0, 10),
        });
      }
      onProgress?.("materialize_images", {
        phase: "done",
        replacedCount: imgResult.replacedCount,
        skippedCount: imgResult.skippedCount,
      });
      stepTelemetry.materialize_images = createFinalizeStepTelemetry(stepStartedAt, "done", {
        maxReplacements,
        replacedCount: imgResult.replacedCount,
        skippedCount: imgResult.skippedCount,
      });
    } catch (imgErr) {
      console.warn("[image-materializer] Non-fatal error, continuing with placeholders:", imgErr);
      onProgress?.("materialize_images", { phase: "error" });
      stepTelemetry.materialize_images = createFinalizeStepTelemetry(stepStartedAt, "error");
    }
  } else {
    onProgress?.("materialize_images", { phase: "skipped", reason: finalizePath.reason });
    stepTelemetry.materialize_images = createFinalizeStepTelemetry(Date.now(), "skipped", {
      reason: finalizePath.reason,
    });
  }

  return { contentForVersion, stepTelemetry };
}

async function runFinalizeFastPath(params: {
  chatId: string;
  model: string;
  resolvedTier?: CanonicalModelId;
  originalPrompt?: string;
  buildIntent?: BuildIntent;
  buildSpec?: BuildSpec | null;
  resolvedScaffold: ScaffoldManifest | null;
  routePlan?: RoutePlan | null;
  previousFiles?: CodeFile[];
  onProgress?: FinalizeProgressCallback;
  contentForVersion: string;
  finalizePath: FinalizePathPolicy;
  repairPassIndex: number;
}): Promise<FinalizeFastPathResult> {
  const {
    chatId,
    model,
    resolvedTier,
    originalPrompt,
    buildIntent,
    buildSpec,
    resolvedScaffold,
    routePlan,
    previousFiles,
    onProgress,
    finalizePath,
    repairPassIndex,
  } = params;
  let contentForVersion = params.contentForVersion;
  const stepTelemetry: FinalizeStepTelemetryMap = {};

  ensureNonEmptyGenerationContent({
    contentForVersion,
    chatId,
    resolvedScaffold,
    previousFiles,
    stage: "before_validation",
  });

  const validateStartedAt = Date.now();
  onProgress?.("validate_syntax", { phase: "start" });
  const syntaxResult = await validateAndFix(contentForVersion, {
    chatId,
    model,
    resolvedTier,
    onProgress: (evt) => {
      onProgress?.("validate_syntax", {
        pass: evt.pass,
        phase: evt.phase,
        errorCount: evt.errorCount,
      });
    },
  });
  contentForVersion = syntaxResult.content;
  stepTelemetry.validate_syntax = createFinalizeStepTelemetry(validateStartedAt, "done", {
    fixerUsed: syntaxResult.fixerUsed,
    fixerImproved: syntaxResult.fixerImproved,
    errorsBefore: syntaxResult.errorsBefore,
    errorsAfter: syntaxResult.errorsAfter,
    earlyStopReason: syntaxResult.earlyStopReason,
    result: syntaxResult.status,
  });

  if (syntaxResult.fixerUsed || syntaxResult.status !== "passed") {
    devLogAppend("in-progress", {
      type: "syntax-validation.result",
      chatId,
      fixerImproved: syntaxResult.fixerImproved,
      errorsBefore: syntaxResult.errorsBefore,
      errorsAfter: syntaxResult.errorsAfter,
      status: syntaxResult.status,
      pipelineError: syntaxResult.pipelineError,
    });
  }

  ensureNonEmptyGenerationContent({
    contentForVersion,
    chatId,
    resolvedScaffold,
    previousFiles,
    stage: "after_validation",
  });

  let verifierPolishCandidates: string[] = [];
  const verifierTier = resolvedTier ?? "pro";
  const verifierPolicy = resolveVerifierPassPolicy({
    buildSpec,
    finalizePath,
    repairPassIndex,
  });
  if (verifierPolicy.run) {
    const verifierStartedAt = Date.now();
    onProgress?.("verifier", { phase: "start" });
    try {
      const findings = await runVerifierPass(contentForVersion, { resolvedTier: verifierTier });
      verifierPolishCandidates = findings.polishCandidates ?? [];
      devLogAppend("in-progress", {
        type: "verifier-pass",
        chatId,
        blocking: findings.blocking.length,
        quality: findings.quality.length,
        polishCandidates: verifierPolishCandidates.length,
      });
      onProgress?.("verifier", {
        phase: "done",
        blockingCount: findings.blocking.length,
        qualityCount: findings.quality.length,
        polishCandidateCount: verifierPolishCandidates.length,
      });
      stepTelemetry.verifier = createFinalizeStepTelemetry(verifierStartedAt, "done", {
        trigger: verifierPolicy.reason,
        blockingCount: findings.blocking.length,
        qualityCount: findings.quality.length,
        polishCandidateCount: verifierPolishCandidates.length,
      });
    } catch (verifierErr) {
      console.warn("[verifier-pass] Non-fatal error, skipping:", verifierErr);
      onProgress?.("verifier", { phase: "error" });
      stepTelemetry.verifier = createFinalizeStepTelemetry(verifierStartedAt, "error");
    }
  } else {
    onProgress?.("verifier", {
      phase: "skipped",
      reason: verifierPolicy.reason,
    });
    stepTelemetry.verifier = createFinalizeStepTelemetry(Date.now(), "skipped", {
      reason: verifierPolicy.reason,
    });
  }

  const polishPolicy = resolvePolishPassPolicy({
    buildSpec,
    finalizePath,
    repairPassIndex,
    verifierPolishCandidates,
    contentForVersion,
  });
  if (polishPolicy.run) {
    const polishStartedAt = Date.now();
    onProgress?.("polish", { phase: "start" });
    try {
      const polishCfg = resolvePostGenerationPolishConfig();
      const polishResult = await runPolishPass(contentForVersion, {
        model,
        polishTargetPaths: verifierPolishCandidates.length > 0 ? verifierPolishCandidates : undefined,
        maxFilesWhenUnscoped: polishCfg.maxFilesWhenUnscoped,
        maxOutputTokens: polishCfg.maxOutputTokens,
        timeoutMs: polishCfg.timeoutMs,
      });
      if (polishResult.applied) {
        contentForVersion = polishResult.polishedContent;
        devLogAppend("in-progress", {
          type: "polish-pass",
          chatId,
          filesChanged: polishResult.filesChanged,
          applied: true,
        });
      }
      onProgress?.("polish", {
        phase: "done",
        applied: polishResult.applied,
        filesChanged: polishResult.filesChanged,
      });
      stepTelemetry.polish = createFinalizeStepTelemetry(polishStartedAt, "done", {
        trigger: polishPolicy.reason,
        applied: polishResult.applied,
        filesChanged: polishResult.filesChanged,
      });
    } catch (polishErr) {
      console.warn("[polish-pass] Non-fatal error, skipping:", polishErr);
      onProgress?.("polish", { phase: "error" });
      stepTelemetry.polish = createFinalizeStepTelemetry(polishStartedAt, "error");
    }
  } else {
    onProgress?.("polish", { phase: "skipped", reason: polishPolicy.reason });
    stepTelemetry.polish = createFinalizeStepTelemetry(Date.now(), "skipped", {
      reason: polishPolicy.reason,
    });
  }

  const parseMergePreflightStartedAt = Date.now();
  onProgress?.("parse_merge_preflight", { phase: "start" });

  let filesJson = parseFilesFromContent(contentForVersion);
  const generatedFiles = (
    JSON.parse(filesJson) as Array<{
      path: string;
      content: string;
      language?: string;
    }>
  ).map((f) => ({ ...f, language: f.language || "tsx" }));

  filesJson = mergeGeneratedProjectFiles({
    chatId,
    originalFilesJson: filesJson,
    generatedFiles,
    resolvedScaffold,
    previousFiles,
  });

  const preflightResult = await runFinalizePreflight({
    chatId,
    model,
    filesJson,
    routePlan,
  });
  filesJson = preflightResult.filesJson;
  filesJson = injectIntegrationManifestIntoFilesJson(filesJson);
  const finalizedFilesForPreview = preflightResult.finalizedFilesForPreview;
  const preflightFileCount = preflightResult.preflightFileCount;
  const preflightIssues = preflightResult.preflightIssues;
  const previewBlockingReason = preflightResult.previewBlockingReason;

  let scaffoldRetry: ScaffoldRetrySuggestion | null = null;
  if (resolvedScaffold && originalPrompt && buildIntent) {
    scaffoldRetry = await inferScaffoldRetrySuggestion({
      prompt: originalPrompt,
      buildIntent,
      resolvedScaffold,
      preflightIssues,
      previewBlockingReason,
      finalizedFilesForPreview,
    });
    if (scaffoldRetry) {
      devLogAppend("in-progress", {
        type: "scaffold-retry.suggested",
        chatId,
        currentScaffoldId: scaffoldRetry.currentScaffoldId,
        suggestedScaffoldId: scaffoldRetry.suggestedScaffoldId,
        failureType: scaffoldRetry.failureType,
        source: scaffoldRetry.source,
        confidence: scaffoldRetry.confidence,
      });
    }
  }

  stepTelemetry.parse_merge_preflight = createFinalizeStepTelemetry(
    parseMergePreflightStartedAt,
    "done",
    {
      fileCount: preflightFileCount,
      issueCount: preflightIssues.length,
      previewBlocked: Boolean(previewBlockingReason),
      scaffoldRetrySuggested: scaffoldRetry?.suggestedScaffoldId ?? null,
    },
  );

  return {
    contentForVersion,
    syntaxResult,
    filesJson,
    preflightResult,
    preflightIssues,
    preflightFileCount,
    previewBlockingReason,
    finalizedFilesForPreview,
    scaffoldRetry,
    stepTelemetry,
  };
}

/**
 * Shared post-generation pipeline: autofix -> URL expansion -> image materialize ->
 * optional polish LLM -> syntax validate/fix -> file parsing -> scaffold merge ->
 * preflight -> assistant message -> version save.
 *
 * Assistant row + draft version are persisted in one DB transaction (no orphan assistant
 * if version insert fails). Steps after that (preflight error logs, telemetry, generation
 * log, verification state) are best-effort: the user already has a saved version + message;
 * failures there are logged but do not roll back the version.
 */
export async function finalizeAndSaveVersion(
  params: FinalizeParams,
): Promise<FinalizeResult> {
  const {
    accumulatedContent,
    chatId,
    model,
    resolvedTier,
    originalPrompt,
    buildIntent,
    buildSpec,
    routePlan,
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
  } = params;

  let contentForVersion = accumulatedContent;
  const finalizePath = resolveFinalizePathPolicy({ buildSpec, repairPassIndex });
  let autoFixFixCount = 0;
  let autoFixWarningCount = 0;
  let autoFixDependencyCount = 0;
  let telemetryRecordId: string | null = null;
  const finalizeStepTelemetry: FinalizeStepTelemetryMap = {};

  devLogAppend("in-progress", {
    type: "finalize.pipeline",
    chatId,
    phases: OWN_ENGINE_POST_STREAM_PIPELINE.map((p) => p.id),
    repairPassIndex,
    finalizePath: finalizePath.runDeepPath ? "fast+deep" : "fast-only",
    finalizePathReason: finalizePath.reason,
  });

  // 1. Autofix
  if (runAutofix) {
    const autoFixStartedAt = Date.now();
    onProgress?.("autofix", { phase: "start", chatId });
    try {
      const autoFixResult = await runAutoFix(accumulatedContent, {
        chatId,
        model,
      });
      contentForVersion = autoFixResult.fixedContent;
      autoFixFixCount = autoFixResult.fixes.length;
      autoFixWarningCount = autoFixResult.warnings.length;
      autoFixDependencyCount = Object.keys(autoFixResult.dependencies).length;

      if (autoFixResult.fixes.length > 0 || autoFixResult.warnings.length > 0) {
        devLogAppend("in-progress", {
          type: "autofix.result",
          chatId,
          fixes: autoFixResult.fixes,
          warnings: autoFixResult.warnings.slice(0, 20),
          dependencies: autoFixResult.dependencies,
        });
      }
      onProgress?.("autofix", {
        phase: "done",
        fixes: autoFixResult.fixes.length,
        warnings: autoFixResult.warnings.length,
      });
      finalizeStepTelemetry.autofix = createFinalizeStepTelemetry(autoFixStartedAt, "done", {
        fixCount: autoFixResult.fixes.length,
        warningCount: autoFixResult.warnings.length,
        dependencyCount: Object.keys(autoFixResult.dependencies).length,
      });
    } catch (autofixErr) {
      console.warn("[autofix] Pipeline error, using raw content:", autofixErr);
      onProgress?.("autofix", { phase: "error" });
      finalizeStepTelemetry.autofix = createFinalizeStepTelemetry(autoFixStartedAt, "error");
    }
  } else {
    finalizeStepTelemetry.autofix = createFinalizeStepTelemetry(Date.now(), "skipped", {
      reason: "disabled",
    });
  }

  // 2. URL expansion (before polish so polish sees final URLs)
  const urlExpandStartedAt = Date.now();
  onProgress?.("url_expand", { phase: "start" });
  contentForVersion = expandUrls(contentForVersion, urlMap);
  onProgress?.("url_expand", { phase: "done" });
  finalizeStepTelemetry.url_expand = createFinalizeStepTelemetry(urlExpandStartedAt, "done");

  const deepPathResult = await runFinalizeDeepPath({
    chatId,
    model,
    buildSpec,
    repairPassIndex,
    onProgress,
    contentForVersion,
    finalizePath,
  });
  contentForVersion = deepPathResult.contentForVersion;
  Object.assign(finalizeStepTelemetry, deepPathResult.stepTelemetry);

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
    previousFiles,
    onProgress,
    contentForVersion,
    finalizePath,
    repairPassIndex,
  });
  contentForVersion = fastPathContent;
  Object.assign(finalizeStepTelemetry, fastPathStepTelemetry);

  // 5–6. Persist assistant + draft version atomically after merge/preflight.
  const { message: assistantMsg, version: initialVersion } =
    await chatRepo.addAssistantMessageAndCreateDraftVersion(chatId, contentForVersion, filesJson);
  let version = initialVersion;
  devLogAppend("in-progress", {
    type: "version.created",
    chatId,
    versionId: version.id,
    repairPassIndex,
    lineageHash: lineageHash ?? null,
  });

  if (orchestrationStreamMeta && typeof orchestrationStreamMeta === "object") {
    try {
      const snap = buildPersistedOrchestrationSnapshot({
        streamMeta: { ...orchestrationStreamMeta, lineageHash: lineageHash ?? undefined },
        versionId: version.id,
        chatId,
        buildIntent: buildIntent ?? null,
      });
      const previous = await chatRepo.getChatOrchestrationSnapshot(chatId);
      const merged = mergePersistedOrchestrationSnapshots(previous, snap);
      await chatRepo.updateChatOrchestrationSnapshot(chatId, merged);
    } catch (e) {
      console.warn("[orchestration-snapshot] Failed to persist:", e);
    }
  }
  const {
    preflightErrors,
    preflightWarnings,
    hasVerificationBlockingPreflightErrors,
    hasPreviewBlockingPreflightErrors,
    preflightLogs,
    preflightFailureSummary,
  } = buildFinalizePreflightLogBundle({
    chatId,
    versionId: version.id,
    preflightIssues,
    preflightFileCount,
    previewBlockingReason,
    sandbox: preflightResult.sandbox,
    finalizedPreviewFileCount: finalizedFilesForPreview.length,
    scaffoldRetry,
    routePlan,
  });
  devLogAppend("in-progress", {
    type: "preflight.summary",
    chatId,
    versionId: version.id,
    filesChecked: preflightFileCount,
    issueCount: preflightIssues.length,
    errorCount: preflightErrors.length,
    warningCount: preflightWarnings.length,
    verificationBlocked: hasVerificationBlockingPreflightErrors,
    previewBlocked: hasPreviewBlockingPreflightErrors,
    previewBlockingReason,
    scaffoldRetry,
  });
  onProgress?.("parse_merge_preflight", {
    phase: "done",
    versionId: version.id,
    fileCount: preflightFileCount,
    issueCount: preflightIssues.length,
    verificationBlocked: hasVerificationBlockingPreflightErrors,
    previewBlocked: hasPreviewBlockingPreflightErrors,
  });
  try {
    await createEngineVersionErrorLogs(preflightLogs);
    devLogAppend("in-progress", {
      type: "preflight.logs.persisted",
      chatId,
      versionId: version.id,
      logCount: preflightLogs.length,
    });
  } catch (logErr) {
    console.warn("[preflight] Failed to persist engine version error logs:", logErr);
    devLogAppend("in-progress", {
      type: "preflight.logs.persist-error",
      chatId,
      versionId: version.id,
      logCount: preflightLogs.length,
      message: logErr instanceof Error ? logErr.message : "Unknown preflight log persistence error",
    });
  }

  try {
    const telemetryMeta: Record<string, unknown> = {
      finalizePath: finalizePath.runDeepPath ? "fast+deep" : "fast-only",
      finalizePathReason: finalizePath.reason,
      postStreamSteps: finalizeStepTelemetry,
      repairPassIndex,
      autofix: {
        fixCount: autoFixFixCount,
        warningCount: autoFixWarningCount,
        dependencyCount: autoFixDependencyCount,
      },
      preflight: {
        previewBlocked: hasPreviewBlockingPreflightErrors,
        verificationBlocked: hasVerificationBlockingPreflightErrors,
        issueCount: preflightIssues.length,
        previewFileCount: finalizedFilesForPreview.length,
      },
    };
    if (buildSpec) {
      telemetryMeta.buildSpec = {
        generationMode: buildSpec.generationMode,
        changeScope: buildSpec.changeScope,
        qualityTarget: buildSpec.qualityTarget,
        previewPolicy: buildSpec.previewPolicy,
        verificationPolicy: buildSpec.verificationPolicy,
        contextPolicy: buildSpec.contextPolicy,
        scaffoldFamily: buildSpec.scaffoldFamily,
        stylePack: buildSpec.stylePack,
      };
    }
    if (resolvedTier && isCanonicalModelId(resolvedTier)) {
      telemetryMeta.phaseRouting = getPhaseRoutingSummary(resolvedTier);
    }
    const tls = orchestrationStreamMeta?.templateLibrarySearch;
    if (tls && typeof tls === "object") {
      telemetryMeta.templateLibrarySearch = tls;
    }

    const telemetryRecord = await createGenerationTelemetryRecord({
      chatId,
      versionId: version.id,
      scaffoldId: resolvedScaffold?.id ?? null,
      model,
      buildIntent: buildIntent ?? null,
      retryCount: repairPassIndex,
      autofixApplied: runAutofix,
      syntaxFixerUsed: syntaxResult.fixerUsed,
      preflightErrorCount: preflightErrors.length,
      preflightWarningCount: preflightWarnings.length,
      previewSuccess: !hasPreviewBlockingPreflightErrors,
      previewBlockingReason,
      qualityGateResult: hasVerificationBlockingPreflightErrors
        ? "preflight_failed"
        : "preflight_passed",
      durationMs: Date.now() - startedAt,
      promptTokens: tokenUsage?.prompt ?? null,
      completionTokens: tokenUsage?.completion ?? null,
      fileCount: preflightFileCount,
      scaffoldRetryUsed: false,
      scaffoldRetrySuggested: scaffoldRetry?.suggestedScaffoldId ?? null,
      meta: telemetryMeta,
    });
    telemetryRecordId =
      telemetryRecord && typeof telemetryRecord.id === "string"
        ? telemetryRecord.id
        : null;
  } catch (telemetryErr) {
    console.warn("[telemetry] Failed to write generation telemetry:", telemetryErr);
  }

  // 7. Log generation
  try {
    await chatRepo.logGeneration(
      chatId,
      model,
      {
        prompt: tokenUsage?.prompt,
        completion: tokenUsage?.completion,
      },
      Date.now() - startedAt,
      !hasVerificationBlockingPreflightErrors,
      hasVerificationBlockingPreflightErrors ? preflightFailureSummary : logNote,
    );
    devLogAppend("in-progress", {
      type: "generation-log.persisted",
      chatId,
      versionId: version.id,
      model,
    });
  } catch (generationLogErr) {
    console.warn("[generation-log] Failed to persist engine generation log:", generationLogErr);
    devLogAppend("in-progress", {
      type: "generation-log.persist-error",
      chatId,
      versionId: version.id,
      model,
      message:
        generationLogErr instanceof Error
          ? generationLogErr.message
          : "Unknown generation log persistence error",
    });
  }

  if (hasVerificationBlockingPreflightErrors) {
    try {
      const failedVersion = await chatRepo.failVersionVerification(
        version.id,
        preflightFailureSummary,
      );
      if (failedVersion?.id) {
        version = failedVersion;
      }
      devLogAppend("in-progress", {
        type: "preflight.version.failed",
        chatId,
        versionId: version.id,
        errorCount: preflightErrors.length,
      });
    } catch (verificationErr) {
      console.warn("[preflight] Failed to mark version failed after blocking errors:", verificationErr);
      devLogAppend("in-progress", {
        type: "preflight.version.fail-error",
        chatId,
        versionId: version.id,
        message:
          verificationErr instanceof Error
            ? verificationErr.message
            : "Unknown preflight verification update error",
      });
    }
  }

  debugLog("engine", "Version saved via finalizeAndSaveVersion", {
    chatId,
    versionId: version.id,
    contentLen: contentForVersion.length,
    scaffold: resolvedScaffold?.id ?? null,
    previewBlocked: hasPreviewBlockingPreflightErrors,
    verificationBlocked: hasVerificationBlockingPreflightErrors,
  });

  return {
    version,
    messageId: assistantMsg.id,
    telemetryRecordId,
    previewUrl: null,
    sandboxUrl: null,
    filesJson,
    contentForVersion,
    preflight: {
      verificationBlocked: hasVerificationBlockingPreflightErrors,
      previewBlocked: hasPreviewBlockingPreflightErrors,
      issueCount: preflightIssues.length,
      errorCount: preflightErrors.length,
      warningCount: preflightWarnings.length,
      previewBlockingReason,
      primaryPreviewTarget: preflightResult.sandbox.primaryPreviewTarget,
      issueCategories: [...new Set(preflightIssues.map((issue) => issue.category))],
      sandbox: preflightResult.sandbox,
      scaffoldRetry,
      routePlan,
    },
  };
}
