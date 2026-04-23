import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { checkScaffoldImports } from "@/lib/gen/autofix/rules/scaffold-import-checker";
import { checkCrossFileImports } from "@/lib/gen/autofix/rules/cross-file-import-checker";
import type { CodeFile } from "@/lib/gen/parser";
import { mergeVersionFilesWithWarnings } from "@/lib/gen/version-manager";
import { devLogAppend } from "@/lib/logging/devLog";
import { warnLog } from "@/lib/utils/debug";
import { deriveFollowUpStateFromInputs } from "@/lib/gen/follow-up-predicate";

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
  /**
   * Files whose scaffold-default content was BLOCKED from silently persisting
   * because they belong to the "must be LLM-emitted" path set — primarily
   * `app/page.tsx` (and `src/app/page.tsx`). When this list is non-empty AND
   * the LLM did not emit its own version, the merge result is missing that
   * path and callers should treat the version as verification-blocked.
   *
   * This is the OMTAG fas 1·05 rotorsaksfix for the "Nordic Future Summit"
   * bug class: scaffold-default page.tsx leaking into a user's brand layout.
   *
   * Each entry lists the offending path and whether the LLM emitted its own
   * replacement (`emittedByLlm: true` → merge result still contains a
   * content, it's just the LLM's; `false` → file is absent in merged output).
   */
  scaffoldDefaultsBlocked: Array<{ path: string; emittedByLlm: boolean }>;
  /**
   * Essential LLM-only files that are MISSING from the merged output.
   * Derived from `scaffoldDefaultsBlocked` where `emittedByLlm === false`.
   * Callers (finalize-version → preflight) should mark the version as
   * verification-blocked so the user sees the error instead of a half-baked
   * site assembled from scaffold defaults.
   */
  missingEmittedEssentials: string[];
}

/**
 * Paths whose content may NEVER come from scaffold defaults. If the LLM
 * doesn't emit these, the merge result omits them and the version is
 * marked verification-blocked — rather than silently serving a scaffold
 * page.tsx under a user-specific layout.tsx ("Nordic Future Summit"-class).
 *
 * `app/layout.tsx` is intentionally NOT in this set — LLMs frequently skip
 * layout edits and the scaffold's layout is usually the right choice.
 * Config files (`tailwind.config.*`, `next.config.*`, `package.json`,
 * `tsconfig.json`, `app/globals.css`) also stay available as scaffold
 * defaults since LLMs emit them inconsistently and they rarely cause
 * brand-leak bugs.
 */
const LLM_ONLY_PATHS: ReadonlySet<string> = new Set([
  "app/page.tsx",
  "src/app/page.tsx",
]);

function isLlmOnlyPath(path: string): boolean {
  return LLM_ONLY_PATHS.has(path.replace(/\\/g, "/"));
}

export function mergeGeneratedProjectFiles({
  chatId,
  originalFilesJson,
  generatedFiles,
  resolvedScaffold,
  previousFiles,
}: MergeGeneratedProjectFilesParams): MergeGeneratedProjectFilesResult {
  // OMTAG Fas 2·A / E2: unified follow-up predicate. We only need the
  // `hasMergeablePrevious` answer here — whether there are files to merge
  // against — but routing through the shared module keeps the semantics in
  // lock-step with orchestrate + stream-post.
  const { hasMergeablePrevious } = deriveFollowUpStateFromInputs({
    persistedScaffoldId: resolvedScaffold?.id ?? null,
    previousFilesCount: previousFiles?.length ?? 0,
  });

  if (hasMergeablePrevious) {
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

    return {
      filesJson: JSON.stringify(finalFiles),
      rejectedShrinks,
      rejectedStructural,
      scaffoldDefaultsBlocked: [],
      missingEmittedEssentials: [],
    };
  }

  if (resolvedScaffold) {
    // OMTAG 1·05: partition scaffold files into "safe to use as default"
    // (config, layout, globals.css, components, …) and "must be emitted by
    // the LLM" (app/page.tsx specifically). We build the merge base only
    // from the safe set; the LLM-only set is tracked separately so the
    // caller knows when the LLM forgot to emit an essential file.
    const llmOnlyScaffoldPaths: string[] = [];
    const scaffoldBase = resolvedScaffold.files
      .filter((file) => {
        if (isLlmOnlyPath(file.path)) {
          llmOnlyScaffoldPaths.push(file.path);
          return false;
        }
        return true;
      })
      .map((file) => ({
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

    // Which LLM-only paths did the generator actually emit? (Used both for
    // observability logging and for the missingEmittedEssentials signal.)
    const emittedPaths = new Set(generatedFiles.map((f) => f.path.replace(/\\/g, "/")));
    const scaffoldDefaultsBlocked = llmOnlyScaffoldPaths.map((path) => ({
      path,
      emittedByLlm: emittedPaths.has(path.replace(/\\/g, "/")),
    }));
    const missingEmittedEssentials = scaffoldDefaultsBlocked
      .filter((b) => !b.emittedByLlm)
      .map((b) => b.path);
    if (missingEmittedEssentials.length > 0) {
      // Loud server-side signal: caller (finalize-version → preflight)
      // should mark the version verification-blocked. Client sees it via
      // the downstream SSE preflight payload.
      warnLog(
        "engine",
        "LLM did not emit essential file(s); scaffold default was blocked from persisting",
        { chatId, missingEmittedEssentials, scaffold: resolvedScaffold.id },
      );
      devLogAppend("in-progress", {
        type: "scaffold-default-blocked",
        chatId,
        scaffold: resolvedScaffold.id,
        missingEmittedEssentials,
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
      scaffoldDefaultsBlocked,
      missingEmittedEssentials,
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
      scaffoldDefaultsBlocked: [],
      missingEmittedEssentials: [],
    };
  }

  return {
    filesJson: originalFilesJson,
    rejectedShrinks: [],
    rejectedStructural: [],
    scaffoldDefaultsBlocked: [],
    missingEmittedEssentials: [],
  };
}
