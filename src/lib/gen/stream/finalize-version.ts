import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { validateAndFix } from "@/lib/gen/autofix/validate-and-fix";
import { checkScaffoldImports } from "@/lib/gen/autofix/rules/scaffold-import-checker";
import { checkCrossFileImports } from "@/lib/gen/autofix/rules/cross-file-import-checker";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
import { expandUrls } from "@/lib/gen/url-compress";
import { materializeImages } from "@/lib/gen/post-process/image-materializer";
import { buildPreviewUrl } from "@/lib/gen/preview";
import { repairGeneratedFiles } from "@/lib/gen/repair-generated-files";
import { buildCompleteProject } from "@/lib/gen/project-scaffold";
import type { CodeFile } from "@/lib/gen/parser";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import { createEngineVersionErrorLogs } from "@/lib/db/services";
import { devLogAppend } from "@/lib/logging/devLog";
import { debugLog, warnLog } from "@/lib/utils/debug";

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
}

export interface FinalizeResult {
  version: { id: string };
  messageId: string;
  previewUrl: string;
  filesJson: string;
  contentForVersion: string;
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
  let preflightIssues: Array<{ file: string; severity: "error" | "warning"; message: string }> = [];
  let preflightFileCount = 0;

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
        onProgress?.("autofix", {
          phase: "done",
          fixes: autoFixResult.fixes.length,
          warnings: autoFixResult.warnings.length,
        });
      }
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

  onProgress?.("finalizing", { phase: "start" });

  // 4. Save assistant message
  const assistantMsg = await chatRepo.addMessage(chatId, "assistant", contentForVersion);

  // 5. Parse files + merge (scaffold-based for first gen, previousFiles-based for follow-up)
  const { parseFilesFromContent, mergeVersionFilesWithWarnings } = await import(
    "@/lib/gen/version-manager"
  );
  let filesJson = parseFilesFromContent(contentForVersion);

  const generatedFiles = (
    JSON.parse(filesJson) as Array<{
      path: string;
      content: string;
      language?: string;
    }>
  ).map((f) => ({ ...f, language: f.language || "tsx" }));

  const isFollowUp = previousFiles && previousFiles.length > 0;

  if (isFollowUp) {
    const mergeResult = mergeVersionFilesWithWarnings(previousFiles, generatedFiles);
    const mergedFiles = mergeResult.files;
    if (mergeResult.warnings.length > 0) {
      devLogAppend("in-progress", {
        type: "merge-warnings",
        chatId,
        warnings: mergeResult.warnings,
      });
    }

    const crossFileResult = checkCrossFileImports(mergedFiles);
    let finalFiles = crossFileResult.files;
    if (crossFileResult.fixes.length > 0) {
      devLogAppend("in-progress", {
        type: "cross-file-import-checker",
        chatId,
        fixes: crossFileResult.fixes,
      });
    }

    if (resolvedScaffold) {
      const importResult = checkScaffoldImports(finalFiles, resolvedScaffold);
      finalFiles = importResult.files;
      if (importResult.fixes.length > 0) {
        devLogAppend("in-progress", {
          type: "scaffold-import-checker",
          chatId,
          fixes: importResult.fixes,
        });
      }
    }

    filesJson = JSON.stringify(finalFiles);
  } else if (resolvedScaffold) {
    const scaffoldBase = resolvedScaffold.files.map((f) => ({
      path: f.path,
      content: f.content,
      language: "tsx" as const,
    }));
    const mergeResult = mergeVersionFilesWithWarnings(scaffoldBase, generatedFiles);
    const mergedFiles = mergeResult.files;
    if (mergeResult.warnings.length > 0) {
      devLogAppend("in-progress", {
        type: "merge-warnings",
        chatId,
        warnings: mergeResult.warnings,
      });
    }

    const crossFileResult = checkCrossFileImports(mergedFiles);
    const afterCrossFile = crossFileResult.files;
    if (crossFileResult.fixes.length > 0) {
      devLogAppend("in-progress", {
        type: "cross-file-import-checker",
        chatId,
        fixes: crossFileResult.fixes,
      });
    }

    const importResult = checkScaffoldImports(afterCrossFile, resolvedScaffold);
    if (importResult.fixes.length > 0) {
      devLogAppend("in-progress", {
        type: "scaffold-import-checker",
        chatId,
        fixes: importResult.fixes,
      });
    }
    filesJson = JSON.stringify(importResult.files);
  } else {
    const crossFileResult = checkCrossFileImports(generatedFiles);
    if (crossFileResult.fixes.length > 0) {
      devLogAppend("in-progress", {
        type: "cross-file-import-checker",
        chatId,
        fixes: crossFileResult.fixes,
      });
      filesJson = JSON.stringify(crossFileResult.files);
    }
  }

  // 5d. Final repair pass + project-level sanity checks (post-merge)
  try {
    let finalFiles = (
      JSON.parse(filesJson) as Array<{ path: string; content: string; language?: string }>
    ).map((f) => ({ ...f, language: f.language || "tsx" }));
    const repairResult = repairGeneratedFiles(finalFiles);
    finalFiles = repairResult.files;
    if (repairResult.fixes.length > 0) {
      filesJson = JSON.stringify(finalFiles);
      devLogAppend("in-progress", {
        type: "file-repair",
        chatId,
        fixes: repairResult.fixes,
      });
    }
    const completeProjectFiles = repairGeneratedFiles(buildCompleteProject(finalFiles)).files;
    preflightFileCount = completeProjectFiles.length;
    const sanity = runProjectSanityChecks(completeProjectFiles);
    preflightIssues = sanity.issues;
    if (sanity.issues.length > 0) {
      devLogAppend("in-progress", {
        type: "project-sanity",
        chatId,
        valid: sanity.valid,
        issues: sanity.issues.slice(0, 20),
        completeProjectFiles: completeProjectFiles.length,
      });
    }
  } catch (sanityErr) {
    console.warn("[sanity] Project sanity check error:", sanityErr);
    devLogAppend("in-progress", {
      type: "project-sanity.error",
      chatId,
      message: sanityErr instanceof Error ? sanityErr.message : "Unknown sanity error",
    });
  }

  // 6. Create version
  const version = await chatRepo.createVersion(chatId, assistantMsg.id, filesJson);
  devLogAppend("in-progress", {
    type: "version.created",
    chatId,
    versionId: version.id,
  });
  const preflightErrors = preflightIssues.filter((issue) => issue.severity === "error");
  const preflightWarnings = preflightIssues.filter((issue) => issue.severity === "warning");
  const preflightLogs: Array<{
    chatId: string;
    versionId: string;
    level: "info" | "warning" | "error";
    category: string;
    message: string;
    meta: Record<string, unknown>;
  }> = [
    {
      chatId,
      versionId: version.id,
      level: preflightErrors.length > 0 ? "error" as const : "info" as const,
      category: "preflight:summary",
      message:
        preflightErrors.length > 0
          ? "Automatic preflight found blocking issues."
          : "Automatic preflight completed.",
      meta: {
        filesChecked: preflightFileCount,
        issueCount: preflightIssues.length,
        errorCount: preflightErrors.length,
        warningCount: preflightWarnings.length,
      },
    },
  ];
  if (preflightIssues.length > 0) {
    preflightLogs.push({
      chatId,
      versionId: version.id,
      level: preflightErrors.length > 0 ? "error" as const : "warning" as const,
      category: "preflight:issues",
      message: "Automatic preflight reported issues.",
      meta: { issues: preflightIssues.slice(0, 20) },
    });
  }
  devLogAppend("in-progress", {
    type: "preflight.summary",
    chatId,
    versionId: version.id,
    filesChecked: preflightFileCount,
    issueCount: preflightIssues.length,
    errorCount: preflightErrors.length,
    warningCount: preflightWarnings.length,
  });
  onProgress?.("finalizing", {
    phase: "done",
    versionId: version.id,
    fileCount: preflightFileCount,
    issueCount: preflightIssues.length,
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
      true,
      logNote,
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

  const previewUrl = buildPreviewUrl(chatId, version.id);

  debugLog("engine", "Version saved via finalizeAndSaveVersion", {
    chatId,
    versionId: version.id,
    contentLen: contentForVersion.length,
    scaffold: resolvedScaffold?.id ?? null,
  });

  return {
    version,
    messageId: assistantMsg.id,
    previewUrl,
    filesJson,
    contentForVersion,
  };
}
