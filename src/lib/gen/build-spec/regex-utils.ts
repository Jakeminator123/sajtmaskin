/**
 * Tiny regex-building helpers used by prompt-pattern banks.
 *
 * Extracted from `src/lib/gen/build-spec.ts` 2026-04-21.
 */

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function wholeWordPatterns(values: readonly string[]): RegExp[] {
  return values.map((value) => new RegExp(`\\b${escapeRegex(value)}\\b`, "i"));
}

export function phrasePatterns(values: readonly string[]): RegExp[] {
  return values.map((value) => {
    const escaped = escapeRegex(value).replace(/\\ /g, "\\s+");
    return new RegExp(`\\b${escaped}\\b`, "i");
  });
}
