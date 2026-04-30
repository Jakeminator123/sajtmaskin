/**
 * Regex pattern banks used by `policy-inference.ts` + `route-realization.ts`.
 *
 * Split out of `build-spec.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWordPatterns(values: readonly string[]): RegExp[] {
  return values.map((value) => new RegExp(`\\b${escapeRegex(value)}\\b`, "i"));
}

function phrasePatterns(values: readonly string[]): RegExp[] {
  return values.map((value) => {
    const escaped = escapeRegex(value).replace(/\\ /g, "\\s+");
    return new RegExp(`\\b${escaped}\\b`, "i");
  });
}

export const REDESIGN_PATTERNS = phrasePatterns([
  "redesign",
  "rebrand",
  "restyle",
  "start over",
  "from scratch",
  "helt ny riktning",
  "gör om från grunden",
]);

export const COPY_PATTERNS = wholeWordPatterns([
  "copy",
  "text",
  "innehåll",
  "content",
  "headline",
  "tagline",
  "seo",
  "meta",
  "wording",
]);

export const COPY_GUARD_PATTERNS = [
  /\bbehåll(?:er)?\b.*\bdesign(?:en)?\b/i,
  /\bbehåll(?:er)?\b.*\blayout(?:en)?\b/i,
  /\bkeep\b.*\bdesign\b/i,
  /\bkeep\b.*\blayout\b/i,
  /\bwithout changing\b.*\bdesign\b/i,
  /\bwithout changing\b.*\blayout\b/i,
];

export const LAYOUT_PATTERNS = wholeWordPatterns([
  "layout",
  "spacing",
  "färg",
  "color",
  "palette",
  "hero",
  "footer",
  "header",
  "animation",
  "motion",
  "design",
  "visual",
]);

export const PAGE_ADDITION_PATTERNS = [
  /\badd(?: another)?(?: new)? (?:page|route)\b/i,
  /\bcreate(?: another)?(?: new)? (?:page|route)\b/i,
  /\bnew page\b/i,
  /\bnew route\b/i,
  /\blägg till sida\b/i,
  /\blägg till (?:en |en ny |ny )?(?:sida|route)\b/i,
  /\bny sida\b/i,
  /\bny route\b/i,
  /\b(?:pricing|blog|contact|about|services|products?) page\b/i,
  /\bkontaktsida\b/i,
];

/**
 * Section/block/area cues. When present *without* an explicit page-word
 * (`page` / `sida` / `route`) the user is asking for an in-page section,
 * not a new route — vetoes `PAGE_ADDITION_PATTERNS`. See
 * `isInPageSectionRequest` for the combined check.
 */
export const SECTION_INSTEAD_OF_PAGE_PATTERNS = [
  /\b(?:section|sektion|block|avsnitt|area|region|panel)\b/i,
];

export const EXPLICIT_PAGE_WORD_PATTERNS = [
  /\bpage\b/i,
  /\broute\b/i,
  /\bsida\b/i,
];

export const TARGETED_REPAIR_PATTERNS = [
  /\bauto-fix request\b/i,
  /\btargeted repair\b/i,
  /\bpersisted errors for this version\b/i,
  /\bquality gate\b/i,
];

export const IMAGERY_FOLLOWUP_ESCAPE_PATTERNS = [
  /\b(?:bild(?:en|er|erna)?|image(?:s|ry)?|foto(?:n)?|photo(?:s)?)\b/i,
  /\bplaceholder(?:s|\.svg)?\b/i,
  /\b(?:ai[- ]?bild|ai[- ]?image|generera bild|generate image)\b/i,
  /\b(?:byt|ersätt|replace|swap).{0,20}(?:bild|image|hero[- ]?bild|hero[- ]?image|placeholder)\b/i,
  /\b(?:materialisera|materialize)\b/i,
];

export const SMALL_FOLLOW_UP_HINT_PATTERNS = [
  ...wholeWordPatterns(["bara", "endast", "enbart", "only", "just", "snabbt", "liten", "lite", "minor", "small"]),
  /\b(?:tighten|trim|justera|polera|byt bara|ändra bara|uppdatera bara)\b/i,
];

export const SMALL_FOLLOW_UP_TARGET_PATTERNS = [
  /\b(?:rubrik(?:en)?|titel(?:n)?|heading|copy|text|cta|spacing|marginal|padding|color|färg|font|button|knapp(?:en)?|hero|footer|header(?:n)?|ikon|icon)\b/i,
];

export const INTEGRATION_PATTERNS = wholeWordPatterns([
  "integration",
  "api",
  "database",
  "databas",
  "auth",
  "stripe",
  "supabase",
  "prisma",
  "drizzle",
  "clerk",
  "nextauth",
  "auth0",
  "openai",
  "resend",
  "redis",
  "upstash",
]);

export function includesAny(patterns: RegExp[], value: string): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

/**
 * True when the prompt mentions a section/block/area cue but does NOT
 * separately mention an explicit page word (`page` / `route` / `sida`).
 * Used to veto `PAGE_ADDITION_PATTERNS` so prompts like
 * `"add a pricing section"` resolve to `local-layout` instead of being
 * misclassified as a new route.
 */
export function isInPageSectionRequest(promptLower: string): boolean {
  if (!includesAny(SECTION_INSTEAD_OF_PAGE_PATTERNS, promptLower)) return false;
  return !includesAny(EXPLICIT_PAGE_WORD_PATTERNS, promptLower);
}
