/**
 * SCAFFOLD_PROTECTED_PATHS — paths whose content MUST come from the
 * scaffold default (or the previous persisted version on follow-up /
 * server-repair). LLM emissions targeting these paths are dropped before
 * persist regardless of which pipeline branch produced them.
 *
 * Why this lives in its own module:
 *
 * Three pipelines persist files:
 *   1. `mergeGeneratedProjectFiles` (init / follow-up via finalize-merge.ts)
 *   2. `tryPromoteAfterGate` (auto server-verify repair via server-verify.ts)
 *   3. Manual repair route (POST /api/engine/chats/[chatId]/repair/route.ts)
 *
 * Pre-2026-04-27 the partition logic only existed inside finalize-merge.ts,
 * so (2) and (3) silently bypassed the guard — broken JSX-in-`.ts`
 * `app/api/placeholder/route.ts` would land in `engineVersions.files_json`
 * via `saveRepairedFiles()` and re-trigger the same "Expected '>' but found
 * 'style'" syntax errors that protected-paths was supposed to prevent.
 * That bypass explained 6/13 failing prompts in the
 * 2026-04-27 baseline-after-revert eval (`coffee-shop`, `restaurant`,
 * `agency`, `booking-service`, `multi-page-brochure`,
 * `consultant-landing`).
 *
 * By centralising the set + partition helper in this leaf module, all
 * three pipelines depend on the same source of truth and a future
 * addition (e.g. `app/sitemap.ts`, `app/robots.ts`) automatically lands
 * in every persist path.
 *
 * Counterpart of `LLM_ONLY_PATHS` in `finalize-merge.ts` (which forces the
 * LLM to emit the file).
 *
 * Add new entries ONLY when:
 *   1. The file is pure utility — no brand, copy, design, or business logic.
 *   2. The scaffold-shipped version is verified correct.
 *   3. Customers will not need to customize it per project.
 */

import type { CodeFile } from "@/lib/gen/parser";

export const SCAFFOLD_PROTECTED_PATHS: ReadonlySet<string> = new Set([
  "app/icon.svg",
  "app/api/placeholder/route.ts",
]);

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}

export function isScaffoldProtectedPath(path: string): boolean {
  return SCAFFOLD_PROTECTED_PATHS.has(normalize(path));
}

export interface ProtectedPathPartition<T extends { path: string }> {
  kept: T[];
  dropped: T[];
}

export function partitionGeneratedFilesForProtectedPaths<
  T extends { path: string },
>(files: T[]): ProtectedPathPartition<T> {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const file of files) {
    if (isScaffoldProtectedPath(file.path)) {
      dropped.push(file);
    } else {
      kept.push(file);
    }
  }
  return { kept, dropped };
}

/**
 * Re-inject protected paths from a fallback source (previous persisted
 * version files) into a partitioned `kept` set.
 *
 * Used by repair pipelines that produce a fresh files-list and need to
 * preserve the canonical scaffold/previous version of protected paths
 * even when the LLM repair output omits them after partition.
 *
 * Returns the merged `kept`-set + arrays describing what was reinjected
 * vs what stayed missing (callers log telemetry on these).
 */
export function reinjectProtectedPathsFromFallback(params: {
  kept: CodeFile[];
  droppedPaths: string[];
  fallbackFiles: CodeFile[];
}): {
  files: CodeFile[];
  reinjected: string[];
  stillMissing: string[];
} {
  const { kept, droppedPaths, fallbackFiles } = params;
  if (droppedPaths.length === 0) {
    return { files: kept, reinjected: [], stillMissing: [] };
  }
  const fallbackByPath = new Map<string, CodeFile>();
  for (const file of fallbackFiles) {
    fallbackByPath.set(normalize(file.path), file);
  }
  const reinjected: string[] = [];
  const stillMissing: string[] = [];
  const merged = [...kept];
  for (const droppedPath of droppedPaths) {
    const fallback = fallbackByPath.get(normalize(droppedPath));
    if (fallback) {
      merged.push(fallback);
      reinjected.push(droppedPath);
    } else {
      stillMissing.push(droppedPath);
    }
  }
  return { files: merged, reinjected, stillMissing };
}
