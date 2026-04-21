/**
 * Regex pattern banks used by BuildSpec inference (change-scope, quality
 * target, context policy, targeted-repair detection).
 *
 * Extracted from `src/lib/gen/build-spec.ts` 2026-04-21. Behavior-preserving.
 */

import { wholeWordPatterns, phrasePatterns } from "./regex-utils";

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

export const TARGETED_REPAIR_PATTERNS = [
  /\bauto-fix request\b/i,
  /\btargeted repair\b/i,
  /\bpersisted errors for this version\b/i,
  /\bquality gate\b/i,
];

export const IMAGE_FOLLOWUP_ESCAPE_PATTERNS = [
  /\b(?:bild(?:en|er|erna)?|image(?:s|ry)?|foto(?:n)?|photo(?:s)?)\b/i,
  /\bplaceholder(?:s|\.svg)?\b/i,
  /\b(?:ai[- ]?bild|ai[- ]?image|generera bild|generate image)\b/i,
  /\b(?:byt|ersätt|replace|swap).{0,20}(?:bild|image|hero[- ]?bild|hero[- ]?image|placeholder)\b/i,
  /\b(?:materialisera|materialize)\b/i,
];

export const SMALL_FOLLOW_UP_HINT_PATTERNS = [
  ...wholeWordPatterns([
    "bara",
    "endast",
    "enbart",
    "only",
    "just",
    "snabbt",
    "liten",
    "lite",
    "minor",
    "small",
  ]),
  /\b(?:tighten|trim|justera|polera|byt bara|ändra bara|uppdatera bara)\b/i,
];

export const SMALL_FOLLOW_UP_TARGET_PATTERNS = [
  /\b(?:rubrik(?:en)?|titel(?:n)?|heading|copy|text|cta|spacing|marginal|padding|color|färg|font|button|knapp|hero|footer|header|ikon|icon)\b/i,
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
