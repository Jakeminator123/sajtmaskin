/**
 * Scaffold baseline paths — files a generated project owns because the
 * PLATFORM put them there, not because a dossier delivered them.
 *
 * Two sources, unioned:
 *  1. `SCAFFOLD_BASELINE_FILE_PATHS` — the export/finalize baseline injected
 *     into every version (`lib/utils.ts`, `app/layout.tsx`, `tsconfig.json`, …).
 *  2. Every runtime scaffold manifest's own files (`app/page.tsx`,
 *     `components/site-header.tsx`, …) — one of these ships with each build,
 *     and a dossier that also declares such a path has no claim on it.
 *
 * Why this exists (F2 in the 2026-07-25 observation session): the
 * `dashboard-charts` manifest declared `components/lib/utils.ts`, which maps
 * to the baseline `lib/utils.ts`. No OTHER dossier declared that path, so the
 * version-presence resolver counted it as "distinctive" evidence and reported
 * the charts dossier as built in every single site — including sites without
 * a single chart. Removing the manifest line fixes that one dossier; treating
 * the baseline as never-distinctive is what stops the next manifest from
 * reintroducing the same false positive.
 */
import { SCAFFOLD_BASELINE_FILE_PATHS } from "../export/project-scaffold";
import { getAllScaffolds } from "./registry";

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

let cached: ReadonlySet<string> | null = null;

/**
 * All baseline-owned output paths. Memoized — both sources are static module
 * data, so the set is identical for the lifetime of the process.
 */
export function getScaffoldBaselinePaths(): ReadonlySet<string> {
  if (cached) return cached;
  const paths = new Set<string>();
  for (const path of SCAFFOLD_BASELINE_FILE_PATHS) {
    paths.add(normalize(path));
  }
  for (const scaffold of getAllScaffolds()) {
    for (const file of scaffold.files) {
      paths.add(normalize(file.path));
    }
  }
  cached = paths;
  return cached;
}

/** True when `path` is owned by the platform baseline rather than a dossier. */
export function isScaffoldBaselinePath(path: string): boolean {
  return getScaffoldBaselinePaths().has(normalize(path));
}
