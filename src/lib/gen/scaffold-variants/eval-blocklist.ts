import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Reads the per-scaffold variant eval report and exposes its
 * `candidatesForRemoval` list as a blocklist for the variant picker. The eval
 * pipeline (see `scripts/scaffolds/eval-landing-variants.ts`) regenerates the
 * report with variant ids that lost every prompt in the eval suite.
 *
 * Mtime-cached so we don't re-parse on every pick. Returns an empty set when
 * the file is missing (fresh checkout / not yet evaluated).
 *
 * FILENAME CONTRACT: writer and reader MUST agree. The reader used to look up
 * `<scaffoldId>-variant-latest.json` while the eval script wrote
 * `landing-variant-latest.json`, so for the only scaffold that had a report
 * (`landing-page`) the lookup always missed and the blocklist was dead code.
 * {@link variantEvalReportPath} is now the single source of truth for both
 * sides — import it in any new eval script instead of re-deriving the name.
 *
 * STALENESS GUARD: a report only blocks variants it actually evaluated. When
 * new variant JSON files have landed since the report was generated, the
 * report's "this variant never wins" verdict was reached without seeing the
 * current candidate field, so applying it would silently retire design
 * directions on evidence that no longer holds. Such a report is ignored (and
 * logged once) until the eval is re-run.
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
  variantsBySummary?: Array<{ id?: string }>;
}

interface ScaffoldBlocklistCacheEntry {
  mtimeMs: number;
  blocked: ReadonlySet<string>;
  /** Variant ids the report actually scored — the basis of the staleness guard. */
  evaluatedIds: ReadonlySet<string>;
}

const cache = new Map<string, ScaffoldBlocklistCacheEntry>();
const staleWarned = new Set<string>();

/** Canonical report filename for a scaffold. Used by the eval script AND the loader. */
export function variantEvalReportFileName(scaffoldId: string): string {
  return `${scaffoldId}-variant-latest.json`;
}

/** Canonical absolute report path for a scaffold. */
export function variantEvalReportPath(scaffoldId: string): string {
  return resolve(REPORTS_DIR, variantEvalReportFileName(scaffoldId));
}

function readReport(scaffoldId: string): ScaffoldBlocklistCacheEntry | null {
  const filePath = variantEvalReportPath(scaffoldId);
  if (!existsSync(filePath)) {
    cache.delete(scaffoldId);
    return null;
  }
  const mtime = statSync(filePath).mtimeMs;
  const cached = cache.get(scaffoldId);
  if (cached && cached.mtimeMs === mtime) return cached;
  try {
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as VariantEvalReport;
    const list = Array.isArray(data.candidatesForRemoval)
      ? data.candidatesForRemoval.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [];
    const evaluated = Array.isArray(data.variantsBySummary)
      ? data.variantsBySummary
          .map((entry) => entry?.id)
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    const entry: ScaffoldBlocklistCacheEntry = {
      mtimeMs: mtime,
      blocked: new Set(list),
      evaluatedIds: new Set(evaluated),
    };
    cache.set(scaffoldId, entry);
    return entry;
  } catch {
    cache.delete(scaffoldId);
    return null;
  }
}

/**
 * Returns the set of variant ids that should be excluded from the picker's
 * candidate pool for the given scaffold. Empty set when no report exists, the
 * report has no candidates flagged for removal, or the report is stale relative
 * to `knownVariantIds` (see the staleness guard above).
 *
 * `knownVariantIds` is optional: when omitted the staleness guard is skipped.
 * Runtime callers should always pass the registry's current ids.
 */
export function getBlockedVariantIds(
  scaffoldId: string,
  knownVariantIds?: readonly string[],
): ReadonlySet<string> {
  const id = scaffoldId.trim();
  if (!id) return new Set();
  const entry = readReport(id);
  if (!entry || entry.blocked.size === 0) return new Set();
  if (knownVariantIds) {
    const unevaluated = knownVariantIds.filter((variantId) => !entry.evaluatedIds.has(variantId));
    if (unevaluated.length > 0) {
      if (!staleWarned.has(id)) {
        staleWarned.add(id);
        console.info("[scaffold-variant] eval_blocklist_stale", {
          scaffoldId: id,
          unevaluatedVariantIds: unevaluated,
          blockedIds: [...entry.blocked],
        });
      }
      return new Set();
    }
  }
  return entry.blocked;
}
