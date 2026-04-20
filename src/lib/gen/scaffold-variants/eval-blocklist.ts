import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Reads `data/scaffold-eval/reports/landing-variant-latest.json` and
 * exposes the `candidatesForRemoval` list as a per-scaffold blocklist
 * for the variant picker. The eval pipeline (see
 * `scripts/scaffolds/eval-landing-variants.ts`) regenerates this file
 * with variant ids that lost every prompt in the eval suite.
 *
 * Mtime-cached so we don't re-parse on every pick. Returns an empty
 * set when the file is missing (fresh checkout / not yet evaluated).
 *
 * Note: today the eval script only writes a `landing-variant-latest.json`
 * file (one report per scaffold). The loader looks up other scaffolds
 * by convention `<scaffoldId>-variant-latest.json` so future eval
 * scripts can plug in without code changes here.
 */
const REPORTS_DIR = resolve(
  process.cwd(),
  "data",
  "scaffold-eval",
  "reports",
);

interface VariantEvalReport {
  scaffoldId?: string;
  candidatesForRemoval?: string[];
}

interface ScaffoldBlocklistCacheEntry {
  mtimeMs: number;
  blocked: ReadonlySet<string>;
}

const cache = new Map<string, ScaffoldBlocklistCacheEntry>();

function reportPathForScaffold(scaffoldId: string): string {
  return resolve(REPORTS_DIR, `${scaffoldId}-variant-latest.json`);
}

/**
 * Returns the set of variant ids that should be excluded from the
 * picker's candidate pool for the given scaffold. Empty set when no
 * report exists or the report has no candidates flagged for removal.
 */
export function getBlockedVariantIds(scaffoldId: string): ReadonlySet<string> {
  const id = scaffoldId.trim();
  if (!id) return new Set();
  const filePath = reportPathForScaffold(id);
  if (!existsSync(filePath)) {
    cache.delete(id);
    return new Set();
  }
  const mtime = statSync(filePath).mtimeMs;
  const cached = cache.get(id);
  if (cached && cached.mtimeMs === mtime) return cached.blocked;
  try {
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as VariantEvalReport;
    const list = Array.isArray(data.candidatesForRemoval)
      ? data.candidatesForRemoval.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [];
    const blocked: ReadonlySet<string> = new Set(list);
    cache.set(id, { mtimeMs: mtime, blocked });
    return blocked;
  } catch {
    cache.delete(id);
    return new Set();
  }
}
