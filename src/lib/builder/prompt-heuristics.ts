/**
 * Shared word lists for prompt structure/complexity heuristics.
 *
 * Three consumers exist with different purposes and thresholds:
 * - promptAssist.ts  `isStructuredPrompt()` — heading detection → skip formatPrompt()
 * - server-auto-brief-policy.ts  `looksStructuredWebsitePrompt()` — skip server auto-brief
 * - promptOrchestration.ts  `analyzeComplexity()` — budget/strategy scoring
 *
 * They may apply different hit-count thresholds, but the word lists themselves
 * should be shared to avoid semantic drift between the heuristics.
 */

/** Site-structure tokens (SV+EN) — pages, sections, IA keywords */
export const STRUCTURE_TOKENS = [
  "hero",
  "sektion",
  "section",
  "kontakt",
  "contact",
  "om oss",
  "about",
  "cta",
  "faq",
  "pricing",
  "gallery",
  "footer",
  "navbar",
  "navigation",
  "sidebar",
  "dashboard",
  "header",
] as const;

/** Design/visual tokens (SV+EN) */
export const DESIGN_TOKENS = [
  "figma",
  "layout",
  "typography",
  "font",
  "palette",
  "color",
  "färg",
  "spacing",
  "animation",
  "motion",
  "designsystem",
  "landing page",
  "visual",
  "gradient",
  "bakgrund",
  "dark mode",
] as const;

/** Content/domain tokens that indicate a structured website prompt */
export const CONTENT_TOKENS = [
  "produktkatalog",
  "product catalog",
  "catalog",
  "shop",
  "ehandel",
  "e-handel",
] as const;

/** Section/scope markers for complexity analysis */
export const SCOPE_MARKERS = [
  "mal",
  "goal",
  "constraint",
  "requirements",
  "design direction",
  "scope",
  "problem",
  "forbattring",
  "improvement",
  "audit",
] as const;

/** Requirement-intent markers */
export const REQUIREMENT_MARKERS = [
  "must",
  "ska",
  "behover",
  "need to",
  "required",
  "krav",
  "obligatorisk",
] as const;

/**
 * Combined structure + content tokens for "looks structured" checks.
 * Used by auto-brief policy and prompt formatting heuristics.
 */
export const STRUCTURED_PROMPT_TOKENS = [
  ...STRUCTURE_TOKENS,
  ...CONTENT_TOKENS,
] as const;

/** Section-type keywords for formatPrompt / addendum extraction */
export const SECTION_KEYWORDS = [
  "hero",
  "features",
  "pricing",
  "faq",
  "testimonials",
  "contact",
  "about",
  "footer",
  "cta",
  "gallery",
  "services",
  "team",
  "blog",
  "navbar",
] as const;

/** Style/tone keywords for formatPrompt / addendum extraction */
export const STYLE_KEYWORDS = [
  "minimal",
  "modern",
  "clean",
  "bold",
  "playful",
  "professional",
  "luxury",
  "dark",
  "light",
  "retro",
  "corporate",
  "soft",
  "elegant",
  "futuristic",
] as const;

/**
 * Count how many tokens from a list appear in the text.
 */
export function countTokenHits(text: string, tokens: readonly string[]): number {
  const lower = text.toLowerCase();
  return tokens.filter((token) => lower.includes(token)).length;
}
