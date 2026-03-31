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
  reason: "default" | "deep_path_disabled" | "repair_pass" | "light_followup_fast_policy";
}

type FinalizeSyntaxResult = Awaited<ReturnType<typeof validateAndFix>>;
type FinalizePreflightResult = Awaited<ReturnType<typeof runFinalizePreflight>>;

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
    return { runDeepPath: true, reason: "deep_path_disabled" };
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
  repairPassIndex: number;
  onProgress?: FinalizeProgressCallback;
  contentForVersion: string;
  finalizePath: FinalizePathPolicy;
}): Promise<string> {
  const {
    chatId,
    model,
    repairPassIndex,
    onProgress,
    finalizePath,
  } = params;
  let contentForVersion = params.contentForVersion;

  if (finalizePath.runDeepPath) {
    onProgress?.("materialize_images", { phase: "start" });
    try {
      const imgResult = await materializeImages(contentForVersion);
      if (imgResult.replacedCount > 0) {
        contentForVersion = imgResult.content;
        devLogAppend("in-progress", {
          type: "image-materialization",
          chatId,
          replacedCount: imgResult.replacedCount,
          queries: imgResult.queries.slice(0, 10),
        });
      }
      onProgress?.("materialize_images", {
        phase: "done",
        replacedCount: imgResult.replacedCount,
      });
    } catch (imgErr) {
      console.warn("[image-materializer] Non-fatal error, continuing with placeholders:", imgErr);
      onProgress?.("materialize_images", { phase: "error" });
    }
  } else {
    onProgress?.("materialize_images", { phase: "skipped", reason: finalizePath.reason });
  }

  if (finalizePath.runDeepPath && isPolishPassEnabled() && repairPassIndex === 0) {
    onProgress?.("polish", { phase: "start" });
    try {
      const polishResult = await runPolishPass(contentForVersion, { model });
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
    } catch (polishErr) {
      console.warn("[polish-pass] Non-fatal error, skipping:", polishErr);
      onProgress?.("polish", { phase: "error" });
    }
  } else if (!finalizePath.runDeepPath) {
    onProgress?.("polish", { phase: "skipped", reason: finalizePath.reason });
  }

  return contentForVersion;
}

async function runFinalizeFastPath(params: {
  chatId: string;
  model: string;
  resolvedTier?: CanonicalModelId;
  originalPrompt?: string;
  buildIntent?: BuildIntent;
  resolvedScaffold: ScaffoldManifest | null;
  routePlan?: RoutePlan | null;
  previousFiles?: CodeFile[];
  onProgress?: FinalizeProgressCallback;
  contentForVersion: string;
}): Promise<FinalizeFastPathResult> {
  const {
    chatId,
    model,
    resolvedTier,
    originalPrompt,
    buildIntent,
    resolvedScaffold,
    routePlan,
    previousFiles,
    onProgress,
  } = params;
  let contentForVersion = params.contentForVersion;

  ensureNonEmptyGenerationContent({
    contentForVersion,
    chatId,
    resolvedScaffold,
    previousFiles,
    stage: "before_validation",
  });

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
    } catch (autofixErr) {
      console.warn("[autofix] Pipeline error, using raw content:", autofixErr);
      onProgress?.("autofix", { phase: "error" });
    }
  }

  // 2. URL expansion (before polish so polish sees final URLs)
  onProgress?.("url_expand", { phase: "start" });
  contentForVersion = expandUrls(contentForVersion, urlMap);
  onProgress?.("url_expand", { phase: "done" });

  contentForVersion = await runFinalizeDeepPath({
    chatId,
    model,
    repairPassIndex,
    onProgress,
    contentForVersion,
    finalizePath,
  });

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
  } = await runFinalizeFastPath({
    chatId,
    model,
    resolvedTier,
    originalPrompt,
    buildIntent,
    resolvedScaffold,
    routePlan,
    previousFiles,
    onProgress,
    contentForVersion,
  });
  contentForVersion = fastPathContent;

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
