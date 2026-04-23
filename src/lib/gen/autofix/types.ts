import { resolveFixLane, type FixLane } from "./lanes";

/**
 * Canonical types for the phase-3 autofix system.
 *
 * Two fix categories:
 *   - **mechanical** — deterministic regex/AST-based, free, fast, 100% reproducible.
 *   - **llm**        — model-driven repair call, expensive, non-deterministic.
 *
 * All fixers (pipeline.ts, repair-generated-files.ts, llm-fixer.ts) produce
 * `FixEntry` instances so logging and telemetry share a single schema.
 */

export type FixCategory = "mechanical" | "llm";

export interface FixEntry {
  fixer: string;
  category: FixCategory;
  lane?: FixLane;
  description: string;
  file?: string;
  line?: number;
}

export type FixEntryDraft = Omit<FixEntry, "lane"> & { lane?: FixLane };

export function toFixEntry(entry: FixEntryDraft, fallbackLane: FixLane): FixEntry {
  return {
    ...entry,
    lane: resolveFixLane({
      fixer: entry.fixer,
      lane: entry.lane,
      fallbackLane,
    }),
  };
}

export function toFixEntries(entries: FixEntryDraft[], fallbackLane: FixLane): FixEntry[] {
  return entries.map((entry) => toFixEntry(entry, fallbackLane));
}

export interface ResidualError {
  file: string;
  line: number;
  message: string;
  normalizedPattern: string;
}

/**
 * Strip file-specific details (paths, line numbers, variable names) from an
 * error message so that structurally identical errors can be grouped across
 * generations.  E.g. "Cannot find module './foo'" and "Cannot find module
 * './bar'" both normalize to "Cannot find module '<path>'".
 */
export function normalizeErrorPattern(message: string): string {
  return message
    .replace(/['"]\.\/[^'"]+['"]/g, "'<path>'")
    .replace(/['"]@\/[^'"]+['"]/g, "'<path>'")
    .replace(/['"][^'"]*\/[^'"]+['"]/g, "'<path>'")
    .replace(/\b[A-Z][a-zA-Z0-9_]+\b/g, "<Ident>")
    .replace(/line \d+/gi, "line <N>")
    .replace(/:\d+:\d+/g, ":<N>:<N>")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Count occurrences of each fixer name in a list of fix entries.
 */
export function countByFixer(fixes: FixEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const fix of fixes) {
    counts[fix.fixer] = (counts[fix.fixer] ?? 0) + 1;
  }
  return counts;
}
