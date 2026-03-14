import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { checkScaffoldImports } from "@/lib/gen/autofix/rules/scaffold-import-checker";
import { checkCrossFileImports } from "@/lib/gen/autofix/rules/cross-file-import-checker";
import type { CodeFile } from "@/lib/gen/parser";
import { mergeVersionFilesWithWarnings } from "@/lib/gen/version-manager";
import { devLogAppend } from "@/lib/logging/devLog";

export interface MergeGeneratedProjectFilesParams {
  chatId: string;
  originalFilesJson: string;
  generatedFiles: CodeFile[];
  resolvedScaffold: ScaffoldManifest | null;
  previousFiles?: CodeFile[];
}

export function mergeGeneratedProjectFiles({
  chatId,
  originalFilesJson,
  generatedFiles,
  resolvedScaffold,
  previousFiles,
}: MergeGeneratedProjectFilesParams): string {
  const isFollowUp = Boolean(previousFiles && previousFiles.length > 0);

  if (isFollowUp) {
    const mergeResult = mergeVersionFilesWithWarnings(previousFiles!, generatedFiles);
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

    return JSON.stringify(finalFiles);
  }

  if (resolvedScaffold) {
    const scaffoldBase = resolvedScaffold.files.map((file) => ({
      path: file.path,
      content: file.content,
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

    return JSON.stringify(importResult.files);
  }

  const crossFileResult = checkCrossFileImports(generatedFiles);
  if (crossFileResult.fixes.length > 0) {
    devLogAppend("in-progress", {
      type: "cross-file-import-checker",
      chatId,
      fixes: crossFileResult.fixes,
    });
    return JSON.stringify(crossFileResult.files);
  }

  return originalFilesJson;
}
