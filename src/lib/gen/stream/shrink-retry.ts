/**
 * Shrink-retry helper.
 *
 * When `mergeVersionFilesWithWarnings` rejects significantly shrunken files
 * (LLM emitted a tiny `<div/>` stub that would have overwritten a fully-
 * populated scaffold page), we:
 *
 *   1. Block the preview entirely so the scaffold-with-placeholders sajt
 *      never reaches the user as if it were "done".
 *   2. Surface a hardened retry prompt that explicitly tells the model to
 *      emit a *complete* file and replace every `[platshållare]` with
 *      concrete content from the brief.
 *   3. Let the UI auto-invoke this retry exactly once; after a second
 *      consecutive shrink the user is asked to try again manually.
 *
 * Mirrors the `scaffoldRetry` shape so the existing SSE `done`-payload
 * plumbing, stream-handlers, and post-check panel can carry both signals
 * side-by-side.
 */

const CRITICAL_SHRINK_PATHS = [
  /(^|\/)app\/page\.tsx$/,
  /(^|\/)src\/app\/page\.tsx$/,
  /(^|\/)app\/layout\.tsx$/,
];

export interface ShrinkRetrySuggestion {
  /** Paths (<=5) that were rejected by shrink-guard and triggered the retry. */
  files: string[];
  /** Human-readable reason shown in the post-check panel. */
  reason: string;
  /** Hardened message prefix that the UI prepends to the original user prompt. */
  retryPrompt: string;
  /** Short Swedish CTA label. */
  ctaLabel: string;
}

export interface RejectedShrink {
  file: string;
  previousSize: number;
  newSize: number;
}

export function hasCriticalShrink(rejectedShrinks: RejectedShrink[] | undefined | null): boolean {
  if (!rejectedShrinks || rejectedShrinks.length === 0) return false;
  return rejectedShrinks.some((entry) =>
    CRITICAL_SHRINK_PATHS.some((re) => re.test(entry.file)),
  );
}

/**
 * Build a shrink-retry suggestion when the merge-guard rejected a core
 * page/layout file. Returns null when the rejection is not critical
 * (e.g. only a non-structural component).
 */
export function buildShrinkRetrySuggestion(
  rejectedShrinks: RejectedShrink[] | undefined | null,
): ShrinkRetrySuggestion | null {
  if (!hasCriticalShrink(rejectedShrinks)) return null;

  const criticalFiles = (rejectedShrinks ?? [])
    .filter((entry) => CRITICAL_SHRINK_PATHS.some((re) => re.test(entry.file)))
    .slice(0, 5);
  const fileList = criticalFiles.map((f) => f.file).join(", ");

  const retryPrompt = [
    "RETRY REASON: Previous generation returned an incomplete file for the site’s main page.",
    `Files rejected by the merge-guard: ${fileList || "app/page.tsx"}.`,
    "",
    "You MUST now emit a COMPLETE replacement for each rejected file.",
    "For every `[bracket placeholder]` in the scaffold (e.g. `[Rubrik som säger…]`, `[Tjänst 1]`, `[Bransch]`, `[Ort]`, `[Paket Start]`, `[Inkluderat 1]`), replace it with concrete Swedish content derived from the brief — company name, industry, services, location, pricing, trust signals.",
    "Do not emit short stub files. `app/page.tsx` must be at least as long as the scaffold version (~13KB), and must use the `{{USER_LOGO}}` / `{{USER_IMG_*}}` aliases for actual images where relevant.",
    "",
    "Return the full updated files with real content. Preserve all existing sections, icons and components that are not being changed.",
  ].join("\n");

  return {
    files: criticalFiles.map((f) => f.file),
    reason:
      "Modellen producerade ett ofullständigt `app/page.tsx` i förra försöket. Försök igen med tydligare instruktion om att fylla i alla platshållare.",
    retryPrompt,
    ctaLabel: "Försök igen med mer innehåll",
  };
}
