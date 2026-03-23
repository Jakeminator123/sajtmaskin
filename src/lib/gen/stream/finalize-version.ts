import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { validateAndFix } from "@/lib/gen/autofix/validate-and-fix";
import { runSharedRepair } from "@/lib/gen/autofix/shared-repair";
import { syntaxErrorsToDiagnostics } from "@/lib/gen/autofix/repair-diagnostics";
import { BROAD_REPAIR_MAX_PASSES } from "@/lib/gen/defaults";
import { expandUrls } from "@/lib/gen/url-compress";
import type { PreviewPreflightSummary } from "@/lib/gen/preview-diagnostics";
import { materializeImages } from "@/lib/gen/post-process/image-materializer";
import type { CodeFile } from "@/lib/gen/parser";
import { resolveEngineDemoUrl } from "@/lib/gen/demo-url";
import type { RoutePlan } from "@/lib/gen/route-plan";
import {
  inferScaffoldRetrySuggestion,
  type ScaffoldRetrySuggestion,
} from "@/lib/gen/scaffolds/scaffold-aware-retry";
import { parseFilesFromContent } from "@/lib/gen/version-manager";
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
  buildMethod?: string;
  routePlan?: RoutePlan | null;
  resolvedScaffold: ScaffoldManifest | null;
  scaffoldAlternatives?: string[];
  scaffoldMatchSource?: string | null;
  scaffoldEmbeddingScore?: number | null;
  scaffoldSerializeMode?: string | null;
  urlMap: Record<string, string>;
  startedAt: number;
  runAutofix?: boolean;
  tokenUsage?: { prompt?: number; completion?: number };
  logNote?: string;
  previousFiles?: CodeFile[];
  onProgress?: FinalizeProgressCallback;
}

export interface FinalizeResult {
  version: Awaited<ReturnType<typeof chatRepo.createDraftVersion>>;
  messageId: string;
  previewUrl: string | null;
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
 * file parsing -> scaffold merge -> version save.
 *
 * Replaces 3 near-identical blocks in the engine stream handler.
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
  } = params;

  let contentForVersion = accumulatedContent;
  let preflightIssues: FinalizePreflightIssue[] = [];
  let preflightFileCount = 0;
  let previewBlockingReason: string | null = null;
  let finalizedFilesForPreview: CodeFile[] = [];
  let scaffoldRetry: ScaffoldRetrySuggestion | null = null;
  const phaseTiming: Record<string, number> = {};

  // 1. Autofix (machine fixers)
  if (runAutofix) {
    console.info(`[finalize:autofix] Starting machine fixers for chat=${chatId}`);
    const t0 = performance.now();
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
    phaseTiming.autofixMs = Math.round(performance.now() - t0);
  }

  // 2. Syntax validation + multi-pass fix (LLM fixer gated by runAutofix)
  console.info(`[finalize:syntax] Starting syntax validation for chat=${chatId}`);
  const syntaxT0 = performance.now();
  onProgress?.("validation", { phase: "start" });
  const syntaxResult = await validateAndFix(contentForVersion, {
    chatId,
    model,
    resolvedTier,
    enableFixer: runAutofix,
    onProgress: (evt) => {
      onProgress?.("validation", {
        pass: evt.pass,
        phase: evt.phase,
        errorCount: evt.errorCount,
      });
    },
  });
  contentForVersion = syntaxResult.content;

  if (syntaxResult.fixerUsed) {
    devLogAppend("in-progress", {
      type: "syntax-validation.result",
      chatId,
      fixerImproved: syntaxResult.fixerImproved,
      errorsBefore: syntaxResult.errorsBefore,
      errorsAfter: syntaxResult.errorsAfter,
    });
  }
  phaseTiming.syntaxMs = Math.round(performance.now() - syntaxT0);

  // 2b. Broad repair pass
  if (runAutofix && syntaxResult.errorsAfter > 0) {
    console.info(`[finalize:broad-repair] ${syntaxResult.errorsAfter} errors remain, starting broad repair for chat=${chatId}`);
    const broadT0 = performance.now();
    onProgress?.("broad-repair", { phase: "start" });
    try {
      const { validateGeneratedCode } = await import("@/lib/gen/retry/validate-syntax");
      const broadResult = await runSharedRepair(
        contentForVersion,
        syntaxErrorsToDiagnostics(
          (await validateGeneratedCode(contentForVersion)).errors,
        ),
        async (c) => {
          const v = await validateGeneratedCode(c);
          return syntaxErrorsToDiagnostics(v.errors);
        },
        {
          chatId,
          model,
          resolvedTier,
          maxPasses: BROAD_REPAIR_MAX_PASSES,
          onProgress: (evt) =>
            onProgress?.("broad-repair", {
              pass: evt.pass,
              phase: evt.phase,
              errorCount: evt.errorCount,
            }),
        },
      );
      contentForVersion = broadResult.content;
      if (broadResult.fixerUsed) {
        devLogAppend("in-progress", {
          type: "broad-repair.result",
          chatId,
          fixerImproved: broadResult.fixerImproved,
          diagnosticsBefore: broadResult.diagnosticsBefore,
          diagnosticsAfter: broadResult.diagnosticsAfter,
          passes: broadResult.passes,
        });
      }
    } catch (broadErr) {
      console.warn("[broad-repair] Non-fatal error:", broadErr);
    }
    phaseTiming.broadRepairMs = Math.round(performance.now() - broadT0);
  }

  // 3. URL expansion
  contentForVersion = expandUrls(contentForVersion, urlMap);

  // 3b. Image materialization (replace /placeholder.svg?text=... with real Unsplash URLs)
  const imgT0 = performance.now();
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
  phaseTiming.imageMs = Math.round(performance.now() - imgT0);

  if (!contentForVersion.trim()) {
    warnLog("engine", "Skipping empty generation output", {
      chatId,
      scaffold: resolvedScaffold?.id ?? null,
      hadPreviousFiles: Boolean(previousFiles && previousFiles.length > 0),
    });
    throw new EmptyGenerationError(chatId, resolvedScaffold?.id ?? null);
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

  if (generatedFiles.length === 0) {
    warnLog("engine", "Skipping non-parseable generation output", {
      chatId,
      scaffold: resolvedScaffold?.id ?? null,
      hadPreviousFiles: Boolean(previousFiles && previousFiles.length > 0),
    });
    throw new EmptyGenerationError(chatId, resolvedScaffold?.id ?? null);
  }

  // 5. Save assistant message only after we have parseable project files.
  const assistantMsg = await chatRepo.addMessage(chatId, "assistant", contentForVersion);

  filesJson = mergeGeneratedProjectFiles({
    chatId,
    originalFilesJson: filesJson,
    generatedFiles,
    resolvedScaffold,
    previousFiles,
  });

  console.info(`[finalize:preflight] Starting preflight checks for chat=${chatId}`);
  const preflightT0 = performance.now();
  const preflightResult = await runFinalizePreflight({
    chatId,
    model,
    filesJson,
    routePlan,
  });
  phaseTiming.preflightMs = Math.round(performance.now() - preflightT0);
  filesJson = preflightResult.filesJson;
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

  // 6. Create version
  let version = await chatRepo.createDraftVersion(chatId, assistantMsg.id, filesJson);
  devLogAppend("in-progress", {
    type: "version.created",
    chatId,
    versionId: version.id,
  });
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
      scaffoldAlternatives: params.scaffoldAlternatives ?? null,
      model,
      modelTier: resolvedTier ?? null,
      buildIntent: buildIntent ?? null,
      buildMethod: params.buildMethod ?? null,
      retryCount: 0,
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
      meta: {
        ...(resolvedTier && isCanonicalModelId(resolvedTier)
          ? { phaseRouting: getPhaseRoutingSummary(resolvedTier) }
          : {}),
        scaffoldMatchSource: params.scaffoldMatchSource ?? null,
        scaffoldEmbeddingScore: params.scaffoldEmbeddingScore ?? null,
        scaffoldSerializeMode: params.scaffoldSerializeMode ?? null,
        phaseTiming,
      },
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

  const previewUrl = hasPreviewBlockingPreflightErrors
    ? null
    : resolveEngineDemoUrl(chatId, version);

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
