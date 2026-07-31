/**
 * Byggval — init controls in the preview panel's welcome state.
 *
 * Level 1 wiring (2026-07-31): the controls compose a Swedish prompt block
 * that the existing init pipeline already understands — no new structured
 * contract. Each choice maps to a verified heuristic:
 *
 * - Page count → `detectExplicitPageCount` ("3 sidor") in
 *   `src/lib/gen/route-plan/planning-helpers.ts` (route plan honors it).
 * - Site type → scaffold keyword banks in
 *   `src/lib/gen/scaffolds/keyword-banks.ts` (auto scaffold matching).
 * - Style → variant keywords in `config/scaffold-variants/**` scored by
 *   `pickScaffoldVariant` (word-boundary match, so fragments use the exact
 *   keyword tokens).
 * - Color mode → the dark/light regex boost in
 *   `src/lib/gen/scaffold-variants/matcher.ts` (`mörk`/`ljus`).
 * - Complexity → plain LLM guidance (no dedicated pipeline field yet).
 *
 * Level 2 (structured fields on `MessageOptions`, e.g. `scaffoldIdOverride`)
 * is a separate follow-up step.
 */

export type SiteTypeChoice =
  | "auto"
  | "landing"
  | "portfolio"
  | "blog"
  | "shop"
  | "dashboard";

export type ComplexityChoice = "auto" | "simple" | "medium" | "complex";

export type StyleChoice =
  | "auto"
  | "warm"
  | "corporate"
  | "bold"
  | "editorial"
  | "minimal";

export type ColorModeChoice = "auto" | "light" | "dark";

export interface InitBuildChoices {
  siteType: SiteTypeChoice;
  /** 0 = auto (no preference), otherwise 1–6. */
  pageCount: number;
  complexity: ComplexityChoice;
  style: StyleChoice;
  colorMode: ColorModeChoice;
}

export const DEFAULT_INIT_BUILD_CHOICES: InitBuildChoices = {
  siteType: "auto",
  pageCount: 0,
  complexity: "auto",
  style: "auto",
  colorMode: "auto",
};

export const INIT_BUILD_CHOICES_PREFILL_KEY = "init-build-choices";

/** Max page count the slider offers (route plan itself accepts up to 20). */
export const MAX_PAGE_COUNT_CHOICE = 6;

// Fragment wording is deliberate: it must contain the exact keyword tokens
// the matchers scan for (word-boundary matching — "minimalistisk" would NOT
// hit the keyword "minimal").
const SITE_TYPE_FRAGMENTS: Record<Exclude<SiteTypeChoice, "auto">, string> = {
  // Scaffold-matchern kräver ≥2 keyword-träffar (MIN_SCORE) för ett aktivt
  // val, så fragmenten bär flera bank-tokens: hemsida + webbplats + företag.
  landing: "Sajten är en landningssida — en hemsida/webbplats för ett företag.",
  portfolio: "Sajten är en portfolio med personlig presentation.",
  blog: "Sajten är en blogg med artiklar och inlägg.",
  shop: "Sajten är en webbshop med produkter och varukorg.",
  dashboard: "Sajten är en dashboard med statistik och tabeller.",
};

const COMPLEXITY_FRAGMENTS: Record<Exclude<ComplexityChoice, "auto">, string> = {
  simple: "Håll det enkelt och avskalat med få sektioner.",
  medium: "Lagom detaljnivå med några genomarbetade sektioner.",
  complex: "Gör sajten innehållsrik och detaljerad med många sektioner.",
};

const STYLE_FRAGMENTS: Record<Exclude<StyleChoice, "auto">, string> = {
  warm: "Stil: varm och lokal community-känsla.",
  corporate: "Stil: corporate och professionell.",
  bold: "Stil: bold startup-energi.",
  // Obs: inte "magasin" — "editorial" + "magasin" är BÅDA blog-scaffold-tokens
  // och två träffar (MIN_SCORE) skulle kunna flippa scaffoldvalet till blog
  // när stilen väljs utan sajttyp. En ensam blog-token är under tröskeln.
  editorial: "Stil: editorial med elegant typografi, som en tidning.",
  // Obs: inte "ren design" — "ren" är en light-boost-token i variantmatchern
  // och skulle skeva mot ljusa varianter även när Färgläge står på auto/mörkt.
  minimal: "Stil: minimal och avskalad design.",
};

// Matcherns boost-regex kräver ordgräns runt "mörk"/"ljus" ("mörkt" matchar
// INTE `\bmörk\b`), så fragmenten använder grundformen + engelsk token.
const COLOR_MODE_FRAGMENTS: Record<Exclude<ColorModeChoice, "auto">, string> = {
  light: "Använd ljus färgskala (light mode).",
  dark: "Använd mörk färgskala (dark mode).",
};

// ─────────────────────────────────────────────────────────────────────────
// Level 2: structured wiring. The choices are ALSO sent as structured
// request-meta so the pipeline does not depend on prompt-text heuristics:
//  - siteType   → meta.scaffoldMode "manual" + meta.scaffoldId
//  - pageCount  → meta.pageCountHint (route plan prefers it over regex)
//  - style/colorMode → meta.styleKeywordsHint (variant matching)
// The prompt block above stays as the user-visible artifact; the structured
// signals are authoritative and point the same way.
// ─────────────────────────────────────────────────────────────────────────

/** Scaffold ids per site-type choice (must resolve in the scaffold registry). */
export const SITE_TYPE_SCAFFOLD_IDS: Record<Exclude<SiteTypeChoice, "auto">, string> = {
  landing: "landing-page",
  portfolio: "portfolio",
  blog: "blog",
  shop: "ecommerce",
  dashboard: "dashboard",
};

// English tokens matching variant `keywords` in config/scaffold-variants/**
// (pickScaffoldVariant compares style keywords against variant keywords).
const STYLE_KEYWORD_HINTS: Record<Exclude<StyleChoice, "auto">, string[]> = {
  warm: ["warm", "lokal", "community", "friendly"],
  corporate: ["corporate", "professional", "b2b", "trust"],
  bold: ["bold", "startup", "launch", "momentum"],
  editorial: ["editorial", "elegant", "magazine", "premium"],
  minimal: ["minimal", "typography", "studio", "clean"],
};

// Feeds the embedding text in pickScaffoldVariantAsync; the deterministic
// colorMode boost still comes from the prompt block ("mörk"/"ljus"/dark/light).
const COLOR_MODE_KEYWORD_HINTS: Record<Exclude<ColorModeChoice, "auto">, string[]> = {
  light: ["light mode"],
  dark: ["dark mode"],
};

export interface InitBuildChoicesMeta {
  scaffoldId?: string;
  pageCountHint?: number;
  styleKeywordsHint?: string[];
}

/** Structured request-meta signals for the current choices ({} when all auto). */
export function buildInitBuildChoicesMeta(choices: InitBuildChoices): InitBuildChoicesMeta {
  const meta: InitBuildChoicesMeta = {};
  if (choices.siteType !== "auto") {
    meta.scaffoldId = SITE_TYPE_SCAFFOLD_IDS[choices.siteType];
  }
  if (choices.pageCount >= 1) {
    meta.pageCountHint = Math.min(Math.trunc(choices.pageCount), MAX_PAGE_COUNT_CHOICE);
  }
  const styleKeywords = [
    ...(choices.style !== "auto" ? STYLE_KEYWORD_HINTS[choices.style] : []),
    ...(choices.colorMode !== "auto" ? COLOR_MODE_KEYWORD_HINTS[choices.colorMode] : []),
  ];
  if (styleKeywords.length > 0) {
    meta.styleKeywordsHint = styleKeywords;
  }
  return meta;
}

/**
 * Cross-panel event carrying the CURRENT choices (structured), consumed by
 * `useCreateChat` — same window-event pattern as `prompt-prefill-event.ts`.
 */
export const INIT_BUILD_CHOICES_EVENT = "sajtmaskin:init-build-choices";

export interface InitBuildChoicesEventDetail {
  choices: InitBuildChoices;
}

export function dispatchInitBuildChoices(choices: InitBuildChoices): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<InitBuildChoicesEventDetail>(INIT_BUILD_CHOICES_EVENT, {
      detail: { choices },
    }),
  );
}

/**
 * Compose the Swedish prompt block for the current choices. Returns "" when
 * every control is on auto (the keyed prefill then removes the block).
 */
export function composeInitBuildChoicesText(choices: InitBuildChoices): string {
  const fragments: string[] = [];
  if (choices.siteType !== "auto") {
    fragments.push(SITE_TYPE_FRAGMENTS[choices.siteType]);
  }
  if (choices.pageCount >= 1) {
    const count = Math.min(Math.trunc(choices.pageCount), MAX_PAGE_COUNT_CHOICE);
    fragments.push(count === 1 ? "Sajten ska ha 1 sida." : `Sajten ska ha ${count} sidor.`);
  }
  if (choices.complexity !== "auto") {
    fragments.push(COMPLEXITY_FRAGMENTS[choices.complexity]);
  }
  if (choices.style !== "auto") {
    fragments.push(STYLE_FRAGMENTS[choices.style]);
  }
  if (choices.colorMode !== "auto") {
    fragments.push(COLOR_MODE_FRAGMENTS[choices.colorMode]);
  }
  return fragments.join(" ");
}
