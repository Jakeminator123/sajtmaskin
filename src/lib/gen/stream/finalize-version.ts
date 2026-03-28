import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { validateAndFix } from "@/lib/gen/autofix/validate-and-fix";
import { expandUrls } from "@/lib/gen/url-compress";
import type { PreviewPreflightSummary } from "@/lib/gen/preview-diagnostics";
import { materializeImages } from "@/lib/gen/post-process/image-materializer";
import type { CodeFile } from "@/lib/gen/parser";
import { buildPreviewUrl } from "@/lib/gen/preview";
import type { RoutePlan } from "@/lib/gen/route-plan";
import {
  inferScaffoldRetrySuggestion,
  type ScaffoldRetrySuggestion,
} from "@/lib/gen/scaffolds/scaffold-aware-retry";
import { parseFilesFromContent } from "@/lib/gen/version-manager";
import { runPolishPass, isPolishPassEnabled } from "@/lib/gen/polish-pass";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import {
  createEngineVersionErrorLogs,
  createGenerationTelemetryRecord,
} from "@/lib/db/services";
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

let _lastMaterializedUrls: Set<string> = new Set();

/**
 * URLs the most recent materializeImages() call resolved from Unsplash.
 * The image validator can skip HEAD-checking these since they were just
 * fetched and confirmed valid seconds earlier.
 */
export function getLastMaterializedUrls(): Set<string> {
  return _lastMaterializedUrls;
}

export type FinalizeProgressCallback = (event: string, data: Record<string, unknown>) => void;

export interface FinalizeParams {
  accumulatedContent: string;
  chatId: string;
  model: string;
  resolvedTier?: CanonicalModelId;
  originalPrompt?: string;
  buildIntent?: BuildIntent;
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
}

export interface FinalizeResult {
  version: Awaited<ReturnType<typeof chatRepo.createDraftVersion>>;
  messageId: string;
  previewUrl: string | null;
  /** Sandbox URL when full Next.js preview is started (null until sandbox boots). */
  sandboxUrl: string | null;
  filesJson: string;
  contentForVersion: string;
  preflight: PreviewPreflightSummary;
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

/**
 * Shared post-generation pipeline: autofix -> syntax -> URL expansion ->
 * file parsing -> scaffold merge -> preflight -> assistant message -> version save.
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
  } = params;

  let contentForVersion = accumulatedContent;
  let preflightIssues: FinalizePreflightIssue[] = [];
  let preflightFileCount = 0;
  let previewBlockingReason: string | null = null;
  let finalizedFilesForPreview: CodeFile[] = [];
  let scaffoldRetry: ScaffoldRetrySuggestion | null = null;

  // 1. Autofix
  if (runAutofix) {
    onProgress?.("autofix", { phase: "start", chatId });
    try {
      const autoFixResult = await runAutoFix(accumulatedContent, {
        chatId,
        model,
      });
      contentForVersion = autoFixResult.fixedContent;

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

  // 2. Syntax validation + multi-pass fix
  onProgress?.("validation", { phase: "start" });
  const syntaxResult = await validateAndFix(contentForVersion, {
    chatId,
    model,
    resolvedTier,
    onProgress: (evt) => {
      onProgress?.("validation", {
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

  // 3. URL expansion
  contentForVersion = expandUrls(contentForVersion, urlMap);

  // 3b. Image materialization (replace /placeholder.svg?text=... with real Unsplash URLs)
  try {
    const imgResult = await materializeImages(contentForVersion);
    if (imgResult.replacedCount > 0) {
      contentForVersion = imgResult.content;
      _lastMaterializedUrls = imgResult.resolvedUrls;
      devLogAppend("in-progress", {
        type: "image-materialization",
        chatId,
        replacedCount: imgResult.replacedCount,
        queries: imgResult.queries.slice(0, 10),
      });
    }
  } catch (imgErr) {
    console.warn("[image-materializer] Non-fatal error, continuing with placeholders:", imgErr);
  }

  if (!contentForVersion.trim()) {
    warnLog("engine", "Skipping empty generation output", {
      chatId,
      scaffold: resolvedScaffold?.id ?? null,
      hadPreviousFiles: Boolean(previousFiles && previousFiles.length > 0),
    });
    throw new EmptyGenerationError(chatId, resolvedScaffold?.id ?? null);
  }

  // 3c. Polish pass (feature-flagged second LLM pass for copy/placeholder cleanup)
  if (isPolishPassEnabled() && repairPassIndex === 0) {
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
      onProgress?.("polish", { phase: "done", applied: polishResult.applied, filesChanged: polishResult.filesChanged });
    } catch (polishErr) {
      console.warn("[polish-pass] Non-fatal error, skipping:", polishErr);
      onProgress?.("polish", { phase: "error" });
    }
  }

  onProgress?.("finalizing", { phase: "start" });

  // 4. Parse files + merge (scaffold-based for first gen, previousFiles-based for follow-up)
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
  finalizedFilesForPreview = preflightResult.finalizedFilesForPreview;
  preflightFileCount = preflightResult.preflightFileCount;
  preflightIssues = preflightResult.preflightIssues;
  previewBlockingReason = preflightResult.previewBlockingReason;

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

  // 5–6. Persist assistant + draft version atomically after merge/preflight.
  const { message: assistantMsg, version: initialVersion } =
    await chatRepo.addAssistantMessageAndCreateDraftVersion(chatId, contentForVersion, filesJson);
  let version = initialVersion;
  devLogAppend("in-progress", {
    type: "version.created",
    chatId,
    versionId: version.id,
    repairPassIndex,
  });

  if (orchestrationStreamMeta && typeof orchestrationStreamMeta === "object") {
    try {
      const snap = buildPersistedOrchestrationSnapshot({
        streamMeta: orchestrationStreamMeta,
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
  onProgress?.("finalizing", {
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
    await createGenerationTelemetryRecord({
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
      durationMs: Date.now() - startedAt,
      promptTokens: tokenUsage?.prompt ?? null,
      completionTokens: tokenUsage?.completion ?? null,
      fileCount: preflightFileCount,
      scaffoldRetryUsed: false,
      scaffoldRetrySuggested: scaffoldRetry?.suggestedScaffoldId ?? null,
      meta:
        resolvedTier && isCanonicalModelId(resolvedTier)
          ? { phaseRouting: getPhaseRoutingSummary(resolvedTier) }
          : undefined,
    });
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

  const previewUrl = hasPreviewBlockingPreflightErrors ? null : buildPreviewUrl(chatId, version.id);

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
    previewUrl,
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
      scaffoldRetry,
      routePlan,
    },
  };
}
