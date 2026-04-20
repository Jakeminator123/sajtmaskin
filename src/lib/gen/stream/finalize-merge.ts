import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { checkScaffoldImports } from "@/lib/gen/autofix/rules/scaffold-import-checker";
import { checkCrossFileImports } from "@/lib/gen/autofix/rules/cross-file-import-checker";
import type { CodeFile } from "@/lib/gen/parser";
import { mergeVersionFilesWithWarnings } from "@/lib/gen/version-manager";
import { devLogAppend } from "@/lib/logging/devLog";
import { warnLog } from "@/lib/utils/debug";

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
  /**
   * Files reverted by the structural-elements guard (Element Preservation Guard).
   * Kept separate from `rejectedShrinks` because the user-facing reason is different:
   * the new file dropped a high-value element (`<video>`, `<canvas>`, `<form>`,
   * R3F `<Canvas>`, Rapier `<Physics>`, video/media component, section landmark).
   * Without surfacing this, follow-ups like "byt hero till intro" silently fail.
   */
  rejectedStructural: Array<{
    file: string;
    droppedElements: Array<{ kind: string; label: string }>;
  }>;
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
    const rejectedStructural = mergeResult.warnings
      .filter((w) => w.type === "structural-elements-dropped")
      .map((w) => ({
        file: w.file,
        droppedElements: w.droppedElements ?? [],
      }));
    if (mergeResult.warnings.length > 0) {
      devLogAppend("in-progress", {
        type: "merge-warnings",
        chatId,
        warnings: mergeResult.warnings,
      });
    }
    if (rejectedStructural.length > 0) {
      // Element Preservation Guard fired: log loud so the silent
      // "byt hero till intro" follow-up bug is observable server-side too.
      // Same payload is bubbled to the client via SSE `done.rejectedStructural`.
      warnLog("engine", "Element Preservation Guard reverted follow-up file(s)", {
        chatId,
        rejectedStructural,
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

    return { filesJson: JSON.stringify(finalFiles), rejectedShrinks, rejectedStructural };
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

    return {
      filesJson: JSON.stringify(importResult.files),
      rejectedShrinks: [],
      rejectedStructural: [],
    };
  }

  const crossFileResult = checkCrossFileImports(generatedFiles);
  if (crossFileResult.fixes.length > 0) {
    devLogAppend("in-progress", {
      type: "cross-file-import-checker",
      chatId,
      fixes: crossFileResult.fixes,
    });
    return {
      filesJson: JSON.stringify(crossFileResult.files),
      rejectedShrinks: [],
      rejectedStructural: [],
    };
  }

  return { filesJson: originalFilesJson, rejectedShrinks: [], rejectedStructural: [] };
}
