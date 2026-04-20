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

export interface MergeGeneratedProjectFilesResult {
  filesJson: string;
  /** Files rejected by shrink-guard — surfaced to user so they know why edits were dropped. */
  rejectedShrinks: Array<{ file: string; previousSize: number; newSize: number }>;
}

export function mergeGeneratedProjectFiles({
  chatId,
  originalFilesJson,
  generatedFiles,
  resolvedScaffold,
  previousFiles,
}: MergeGeneratedProjectFilesParams): MergeGeneratedProjectFilesResult {
  const isFollowUp = Boolean(previousFiles && previousFiles.length > 0);

  if (isFollowUp) {
    const mergeResult = mergeVersionFilesWithWarnings(previousFiles!, generatedFiles, {
      rejectSignificantShrinks: true,
      rejectDroppedStructuralElements: true,
    });
    const mergedFiles = mergeResult.files;
    const rejectedShrinks = mergeResult.warnings
      .filter((w) => w.type === "significant-shrink")
      .map((w) => ({ file: w.file, previousSize: w.previousSize, newSize: w.newSize }));
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

    return { filesJson: JSON.stringify(finalFiles), rejectedShrinks };
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

    return { filesJson: JSON.stringify(importResult.files), rejectedShrinks: [] };
  }

  const crossFileResult = checkCrossFileImports(generatedFiles);
  if (crossFileResult.fixes.length > 0) {
    devLogAppend("in-progress", {
      type: "cross-file-import-checker",
      chatId,
      fixes: crossFileResult.fixes,
    });
    return { filesJson: JSON.stringify(crossFileResult.files), rejectedShrinks: [] };
  }

  return { filesJson: originalFilesJson, rejectedShrinks: [] };
}
