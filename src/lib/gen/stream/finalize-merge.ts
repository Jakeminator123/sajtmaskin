import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { checkCrossFileImports } from "@/lib/gen/autofix/rules/cross-file-import-checker";
import { fixTypeOnlyModuleDefaultImports } from "@/lib/gen/autofix/rules/type-only-module-default-import-fixer";
import type { CodeFile } from "@/lib/gen/parser";
import { mergeVersionFilesWithWarnings } from "@/lib/gen/version-manager";
import { devLogAppend } from "@/lib/logging/devLog";
import { warnLog } from "@/lib/utils/debug";
import { deriveFollowUpStateFromInputs } from "@/lib/gen/follow-up-predicate";
import type { DossierEntry } from "@/lib/gen/dossiers/types";
import { applyDossierVerbatimPolicy } from "@/lib/gen/dossiers/verbatim-policy";
import { mapDossierPathToOutput } from "@/lib/gen/dossiers/output-path";
import { partitionGeneratedFilesForProtectedPaths } from "@/lib/gen/scaffolds/protected-paths";

interface ImportFix {
  file: string;
  addedImport: string;
  component: string;
}

function checkScaffoldImports(
  files: CodeFile[],
  scaffold: ScaffoldManifest,
): { files: CodeFile[]; fixes: ImportFix[] } {
  const layoutFile = files.find(
    (f) => f.path === "app/layout.tsx" || f.path === "src/app/layout.tsx",
  );
  if (!layoutFile) return { files, fixes: [] };

  const scaffoldComponents = scaffold.files
    .filter((f) => f.path.startsWith("components/"))
    .map((f) => {
      const exportMatch = f.content.match(
        /export\s+(?:default\s+)?function\s+(\w+)/,
      );
      if (!exportMatch) return null;
      return {
        name: exportMatch[1],
        importPath: `@/${f.path.replace(/\.tsx$/, "")}`,
      };
    })
    .filter(Boolean) as Array<{ name: string; importPath: string }>;

  const fixes: ImportFix[] = [];
  let layoutContent = layoutFile.content;

  for (const comp of scaffoldComponents) {
    const jsxRe = new RegExp(`<${comp.name}[\\s/>]`);
    const isReferenced = jsxRe.test(layoutContent);
    const importRe = new RegExp(
      `import\\s+(?:(?:\\{[^}]*\\b${comp.name}\\b[^}]*\\})|(?:${comp.name}))\\s+from\\s+`,
    );
    const isImported = importRe.test(layoutContent);

    if (isReferenced && !isImported) {
      const importLine = `import { ${comp.name} } from "${comp.importPath}";\n`;
      layoutContent = importLine + layoutContent;
      fixes.push({
        file: layoutFile.path,
        addedImport: importLine.trim(),
        component: comp.name,
      });
    }
  }

  if (fixes.length === 0) return { files, fixes };

  const updatedFiles = files.map((f) =>
    f.path === layoutFile.path ? { ...f, content: layoutContent } : f,
  );

  return { files: updatedFiles, fixes };
}

export interface MergeGeneratedProjectFilesParams {
  chatId: string;
  originalFilesJson: string;
  generatedFiles: CodeFile[];
  resolvedScaffold: ScaffoldManifest | null;
  previousFiles?: CodeFile[];
  /**
   * Dossiers active for this generation. When provided, verbatim-mode files
   * are restored to their canonical on-disk content after merge if the LLM
   * drifted or omitted them.
   * Primary runtime path gets these from explicit orchestration meta
   * `selectedDossierIds`; legacy/eval paths may still pass [].
   */
  selectedDossiers?: DossierEntry[];
  /** File-evidenced dossiers explicitly removed by this follow-up. */
  removedDossiers?: DossierEntry[];
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
  /**
   * Imports the LLM made to local files that did not exist in the merged
   * file set. `cross-file-import-checker` auto-stubbed each of them so the
   * build doesn't die — but the stubs render `null`, meaning the user sees
   * a hollow shell where the real component should have been. When an obvious
   * sibling exists, the checker may instead rewrite the import path and set
   * `rewireTarget`.
   *
   * Plan-02 / STATUS-02: not an `error` — the build IS shippable; just
   * incomplete relative to what the LLM intended.
   */
  crossFileStubs: Array<{
    sourceFile: string;
    missingImport: string;
    stubFile: string;
    rewireTarget?: string;
    rewireImportSpec?: string;
    /** Present when the missing import matches a dossier exposes entry. */
    dossierId?: string;
    capability?: string;
  }>;
}

function normalizeDossierPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "");
}

export function removeExplicitlyRemovedDossierFiles(params: {
  files: CodeFile[];
  removedDossiers: readonly DossierEntry[];
  selectedDossiers: readonly DossierEntry[];
}): { files: CodeFile[]; removedPaths: string[] } {
  const activePaths = new Set(
    params.selectedDossiers.flatMap((dossier) =>
      (dossier.files ?? []).map((file) =>
        normalizeDossierPath(mapDossierPathToOutput(file.path)),
      ),
    ),
  );
  const removablePaths = new Set(
    params.removedDossiers.flatMap((dossier) =>
      (dossier.files ?? [])
        .map((file) =>
          normalizeDossierPath(mapDossierPathToOutput(file.path)),
        )
        .filter((path) => !activePaths.has(path)),
    ),
  );
  if (removablePaths.size === 0) {
    return { files: params.files, removedPaths: [] };
  }
  const removedPaths: string[] = [];
  const files = params.files.filter((file) => {
    const path = normalizeDossierPath(file.path);
    if (!removablePaths.has(path)) return true;
    removedPaths.push(path);
    return false;
  });
  return { files, removedPaths: removedPaths.sort() };
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

/**
 * SCAFFOLD_PROTECTED_PATHS — counterpart of `LLM_ONLY_PATHS`.
 *
 * Source of truth + partition helper now live in
 * `@/lib/gen/scaffolds/protected-paths`. See that module for context on
 * why the set is shared with server-verify and the manual repair route.
 */

export function mergeGeneratedProjectFiles({
  chatId,
  originalFilesJson,
  generatedFiles: rawGeneratedFiles,
  resolvedScaffold,
  previousFiles,
  selectedDossiers,
  removedDossiers,
}: MergeGeneratedProjectFilesParams): MergeGeneratedProjectFilesResult {
  // B05: ids of the dossiers selected for THIS generation. Threaded into
  // checkCrossFileImports so the refuseDossierStubs gate only fires for an
  // unresolved import owned by a selected dossier (not any registry-wide match).
  const selectedDossierIds = selectedDossiers?.map((dossier) => dossier.id);

  // SCAFFOLD_PROTECTED_PATHS: drop LLM emissions targeting paths that must
  // come from the scaffold default. This guard runs BEFORE merge so both the
  // init branch (scaffold-base wins) and the follow-up branch (previousFiles
  // wins) keep the canonical version. See note on `SCAFFOLD_PROTECTED_PATHS`.
  const protectedPartition =
    partitionGeneratedFilesForProtectedPaths(rawGeneratedFiles);
  if (protectedPartition.dropped.length > 0) {
    const droppedPaths = protectedPartition.dropped.map((f) => f.path);
    warnLog(
      "engine",
      "Scaffold-protected paths emitted by LLM — dropping LLM versions to keep scaffold/previous default",
      { chatId, droppedPaths },
    );
    devLogAppend("in-progress", {
      type: "scaffold-protected-overwrite-blocked",
      chatId,
      droppedPaths,
    });
  }
  const generatedFiles = protectedPartition.kept;

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

    const crossFileResult = checkCrossFileImports(mergedFiles, selectedDossierIds);
    let finalFiles = crossFileResult.files;
    if (crossFileResult.fixes.length > 0) {
      devLogAppend("in-progress", {
        type: "cross-file-import-checker",
        chatId,
        fixes: crossFileResult.fixes,
      });
    }

    // Post cross-file: drop default imports that resolve to modules which
    // only `export type X` (TS1361 / missing-default-export). See
    // `type-only-module-default-import-fixer.ts` header for the empirical
    // showcase-gallery.tsx case.
    const typeOnlyModuleResult = fixTypeOnlyModuleDefaultImports(finalFiles);
    if (typeOnlyModuleResult.fixes.length > 0) {
      finalFiles = typeOnlyModuleResult.files;
      devLogAppend("in-progress", {
        type: "type-only-module-default-import-fixer",
        chatId,
        fixes: typeOnlyModuleResult.fixes,
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

    const verbatimResult1 = applyDossierVerbatimPolicy({
      llmFiles: finalFiles,
      selectedDossiers: selectedDossiers ?? [],
      chatId,
    });
    const removalResult = removeExplicitlyRemovedDossierFiles({
      files: verbatimResult1.files,
      removedDossiers: removedDossiers ?? [],
      selectedDossiers: selectedDossiers ?? [],
    });
    if (removalResult.removedPaths.length > 0) {
      devLogAppend("in-progress", {
        type: "dossier-files-removed",
        chatId,
        removedDossierIds: (removedDossiers ?? []).map((dossier) => dossier.id),
        removedPaths: removalResult.removedPaths,
      });
    }
    // The first import pass ran while the old dossier files still existed.
    // Re-run after explicit deletion so any importer the model forgot to edit
    // is rewired/stubbed and surfaced as degraded instead of shipping a
    // dangling module import.
    const postRemovalCrossFileResult =
      removalResult.removedPaths.length > 0
        ? checkCrossFileImports(removalResult.files, selectedDossierIds)
        : { files: removalResult.files, fixes: [] };
    if (postRemovalCrossFileResult.fixes.length > 0) {
      devLogAppend("in-progress", {
        type: "post-removal-cross-file-import-checker",
        chatId,
        fixes: postRemovalCrossFileResult.fixes,
      });
    }

    return {
      filesJson: JSON.stringify(postRemovalCrossFileResult.files),
      rejectedShrinks,
      rejectedStructural,
      scaffoldDefaultsBlocked: [],
      missingEmittedEssentials: [],
      crossFileStubs: [
        ...crossFileResult.fixes,
        ...postRemovalCrossFileResult.fixes,
      ],
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

    const crossFileResult = checkCrossFileImports(mergedFiles, selectedDossierIds);
    let afterCrossFile = crossFileResult.files;
    if (crossFileResult.fixes.length > 0) {
      devLogAppend("in-progress", {
        type: "cross-file-import-checker",
        chatId,
        fixes: crossFileResult.fixes,
      });
    }

    const typeOnlyModuleResult = fixTypeOnlyModuleDefaultImports(afterCrossFile);
    if (typeOnlyModuleResult.fixes.length > 0) {
      afterCrossFile = typeOnlyModuleResult.files;
      devLogAppend("in-progress", {
        type: "type-only-module-default-import-fixer",
        chatId,
        fixes: typeOnlyModuleResult.fixes,
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

    const verbatimResult2 = applyDossierVerbatimPolicy({
      llmFiles: importResult.files,
      selectedDossiers: selectedDossiers ?? [],
      chatId,
    });

    return {
      filesJson: JSON.stringify(verbatimResult2.files),
      rejectedShrinks: [],
      rejectedStructural: [],
      scaffoldDefaultsBlocked,
      missingEmittedEssentials,
      crossFileStubs: crossFileResult.fixes,
    };
  }

  const crossFileResult = checkCrossFileImports(generatedFiles, selectedDossierIds);
  let crossFileFiles = crossFileResult.files;
  if (crossFileResult.fixes.length > 0) {
    devLogAppend("in-progress", {
      type: "cross-file-import-checker",
      chatId,
      fixes: crossFileResult.fixes,
    });
  }
  const typeOnlyModuleResult = fixTypeOnlyModuleDefaultImports(crossFileFiles);
  if (typeOnlyModuleResult.fixes.length > 0) {
    crossFileFiles = typeOnlyModuleResult.files;
    devLogAppend("in-progress", {
      type: "type-only-module-default-import-fixer",
      chatId,
      fixes: typeOnlyModuleResult.fixes,
    });
  }
  if (crossFileResult.fixes.length > 0 || typeOnlyModuleResult.fixes.length > 0) {
    const verbatimResult3 = applyDossierVerbatimPolicy({
      llmFiles: crossFileFiles,
      selectedDossiers: selectedDossiers ?? [],
      chatId,
    });
    return {
      filesJson: JSON.stringify(verbatimResult3.files),
      rejectedShrinks: [],
      rejectedStructural: [],
      scaffoldDefaultsBlocked: [],
      missingEmittedEssentials: [],
      crossFileStubs: crossFileResult.fixes,
    };
  }

  // No merges or fixes — still apply verbatim policy on the raw generated files.
  // The top-of-function SCAFFOLD_PROTECTED_PATHS filter operates on
  // `generatedFiles`, but this fallback branch reads `originalFilesJson`
  // directly. Without re-applying the filter here, an LLM emission that
  // landed in `originalFilesJson` (e.g. a partial-file-repair snapshot,
  // legacy no-scaffold callsite) could bypass the guard and ship broken
  // utility content. Filter again to keep the invariant.
  const parsedOriginal: CodeFile[] = JSON.parse(originalFilesJson);
  const originalPartition =
    partitionGeneratedFilesForProtectedPaths(parsedOriginal);
  if (originalPartition.dropped.length > 0) {
    const droppedPaths = originalPartition.dropped.map((f) => f.path);
    warnLog(
      "engine",
      "Scaffold-protected paths in originalFilesJson fallback — dropping LLM versions",
      { chatId, droppedPaths },
    );
    devLogAppend("in-progress", {
      type: "scaffold-protected-overwrite-blocked",
      chatId,
      droppedPaths,
      branch: "no-merge-no-fixes-fallback",
    });
  }
  const safeOriginal = originalPartition.kept;
  const verbatimResult4 = applyDossierVerbatimPolicy({
    llmFiles: safeOriginal,
    selectedDossiers: selectedDossiers ?? [],
    chatId,
  });
  const hasVerbatimRestorations = verbatimResult4.restored.length > 0;
  const hasFilteredOriginal = originalPartition.dropped.length > 0;
  return {
    filesJson:
      hasVerbatimRestorations || hasFilteredOriginal
        ? JSON.stringify(verbatimResult4.files)
        : originalFilesJson,
    rejectedShrinks: [],
    rejectedStructural: [],
    scaffoldDefaultsBlocked: [],
    missingEmittedEssentials: [],
    crossFileStubs: crossFileResult.fixes,
  };
}
