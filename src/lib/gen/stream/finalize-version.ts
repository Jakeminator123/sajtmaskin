import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { validateAndFix } from "@/lib/gen/autofix/validate-and-fix";
import { checkScaffoldImports } from "@/lib/gen/autofix/rules/scaffold-import-checker";
import { checkCrossFileImports } from "@/lib/gen/autofix/rules/cross-file-import-checker";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
import { expandUrls } from "@/lib/gen/url-compress";
import { materializeImages } from "@/lib/gen/post-process/image-materializer";
import { buildPreviewUrl } from "@/lib/gen/preview";
import * as chatRepo from "@/lib/db/chat-repository";
import { devLogAppend } from "@/lib/logging/devLog";
import { debugLog } from "@/lib/utils/debug";

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
}

export interface FinalizeResult {
  version: { id: string };
  messageId: string;
  previewUrl: string;
  filesJson: string;
  contentForVersion: string;
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
  } = params;

  let contentForVersion = accumulatedContent;

  // 1. Autofix
  if (runAutofix) {
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
    } catch (autofixErr) {
      console.warn("[autofix] Pipeline error, using raw content:", autofixErr);
    }
  }

  // 2. Syntax validation + fix
  const syntaxResult = await validateAndFix(contentForVersion, { chatId, model });
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

  // 4. Save assistant message
  const assistantMsg = chatRepo.addMessage(chatId, "assistant", contentForVersion);

  // 5. Parse files + scaffold merge
  const { parseFilesFromContent, mergeVersionFilesWithWarnings } = await import(
    "@/lib/gen/version-manager"
  );
  let filesJson = parseFilesFromContent(contentForVersion);

  if (resolvedScaffold) {
    const generatedFiles = (
      JSON.parse(filesJson) as Array<{
        path: string;
        content: string;
        language?: string;
      }>
    ).map((f) => ({ ...f, language: f.language || "tsx" }));
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

    // 5b. Cross-file import check (stub missing components)
    const crossFileResult = checkCrossFileImports(mergedFiles);
    const afterCrossFile = crossFileResult.files;
    if (crossFileResult.fixes.length > 0) {
      devLogAppend("in-progress", {
        type: "cross-file-import-checker",
        chatId,
        fixes: crossFileResult.fixes,
      });
    }

    // 5c. Scaffold import check (after merge + cross-file stubs)
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
    // No scaffold — still run cross-file import check on parsed files
    const generatedFiles = (
      JSON.parse(filesJson) as Array<{
        path: string;
        content: string;
        language?: string;
      }>
    ).map((f) => ({ ...f, language: f.language || "tsx" }));
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

  // 5d. Project-level sanity checks (post-merge)
  try {
    const finalFiles = (
      JSON.parse(filesJson) as Array<{ path: string; content: string; language?: string }>
    ).map((f) => ({ ...f, language: f.language || "tsx" }));
    const sanity = runProjectSanityChecks(finalFiles);
    if (sanity.issues.length > 0) {
      devLogAppend("in-progress", {
        type: "project-sanity",
        chatId,
        valid: sanity.valid,
        issues: sanity.issues.slice(0, 20),
      });
    }
  } catch (sanityErr) {
    console.warn("[sanity] Project sanity check error:", sanityErr);
  }

  // 6. Create version
  const version = chatRepo.createVersion(chatId, assistantMsg.id, filesJson);

  // 7. Log generation
  chatRepo.logGeneration(
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
