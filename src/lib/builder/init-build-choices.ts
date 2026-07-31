/**
 * Byggval — init controls in the preview panel's welcome state.
 *
 * All wiring is structured (2026-07-31, ägarbeslut: no prompt-text injection
 * into the chat input). Every choice has a real receiver:
 *
 * - Site type → `meta.scaffoldMode: "manual"` + `meta.scaffoldId`
 *   (manual scaffold selection in orchestrate).
 * - Page count → `meta.pageCountHint` — `buildRoutePlan` prefers it over the
 *   prompt-text regex (`detectExplicitPageCount`).
 * - Style / color mode → `meta.styleKeywordsHint` into scaffold-variant
 *   matching (keyword + embedding).
 * - Complexity → `meta.complexityHint` into `deriveBuildSpec` (`complex`
 *   floors qualityTarget at premium + heavy context-bias; `simple` biases
 *   context lighter) AND a Swedish section-count directive (below).
 * - Complexity / color mode / tone → Swedish LLM directives appended to the
 *   custom-instructions channel (`body.system` → `customInstructions` →
 *   dynamic context) — structured, never touches the visible chat input.
 *
 * The theme preset control (färgpreset) is NOT part of this module — it
 * reuses the existing `designTheme`/`themeColors` shell state directly.
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

export type ToneChoice = "auto" | "professional" | "warm" | "playful";

export interface InitBuildChoices {
  siteType: SiteTypeChoice;
  /** 0 = auto (no preference), otherwise 1–MAX_PAGE_COUNT_CHOICE. */
  pageCount: number;
  complexity: ComplexityChoice;
  style: StyleChoice;
  colorMode: ColorModeChoice;
  /** Copy/voice tone for the generated texts (LLM directive). */
  tone: ToneChoice;
}

export const DEFAULT_INIT_BUILD_CHOICES: InitBuildChoices = {
  siteType: "auto",
  pageCount: 0,
  complexity: "auto",
  style: "auto",
  colorMode: "auto",
  tone: "auto",
};

/**
 * Max page count the control offers. Deliberately 3 (ägarbeslut 2026-07-31):
 * larger initial builds spread the token budget thin and lower per-page
 * quality. The route plan itself still accepts up to 20 via prompt text.
 */
export const MAX_PAGE_COUNT_CHOICE = 3;

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
  // Obs: inte "clean" — den boostar ljus-taggade varianter och skulle kunna
  // trumfa ett mörkt färgläge (samma skäl som "ren" ströks ur promptspåret).
  minimal: ["minimal", "typography", "studio", "white-space"],
};

// "dark mode"/"light mode" feed both the embedding text and the keyword
// scorer (variant keyword "dark" word-boundary-matches inside "dark mode").
const COLOR_MODE_KEYWORD_HINTS: Record<Exclude<ColorModeChoice, "auto">, string[]> = {
  light: ["light mode"],
  dark: ["dark mode"],
};

export interface InitBuildChoicesMeta {
  scaffoldId?: string;
  pageCountHint?: number;
  styleKeywordsHint?: string[];
  /** Mirrors `BuildSpecComplexityHint` on the server. */
  complexityHint?: "simple" | "medium" | "complex";
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
  if (choices.complexity !== "auto") {
    meta.complexityHint = choices.complexity;
  }
  return meta;
}

const COMPLEXITY_DIRECTIVES: Record<Exclude<ComplexityChoice, "auto">, string> = {
  simple: "Håll sajten enkel och avskalad med få sektioner per sida.",
  medium: "Lagom detaljnivå med några genomarbetade sektioner per sida.",
  complex: "Gör sajten innehållsrik och detaljerad med många genomarbetade sektioner.",
};

const COLOR_MODE_DIRECTIVES: Record<Exclude<ColorModeChoice, "auto">, string> = {
  light: "Använd ett ljust färgtema.",
  dark: "Använd ett mörkt färgtema.",
};

const TONE_DIRECTIVES: Record<Exclude<ToneChoice, "auto">, string> = {
  professional: "Ton i texterna: professionell och saklig.",
  warm: "Ton i texterna: varm och personlig.",
  playful: "Ton i texterna: lekfull och energisk.",
};

/**
 * Swedish LLM directives complementing the structured signals: complexity
 * carries the section-count language the LLM needs (BuildSpec only carries
 * budgets/quality), color mode and tone lack pipeline fields entirely.
 * Appended to the custom-instructions channel by `useCreateChat` — never
 * written into the visible chat input. Returns "" when none is active.
 */
export function buildInitBuildChoicesInstructions(choices: InitBuildChoices): string {
  const directives: string[] = [];
  if (choices.complexity !== "auto") {
    directives.push(COMPLEXITY_DIRECTIVES[choices.complexity]);
  }
  if (choices.colorMode !== "auto") {
    directives.push(COLOR_MODE_DIRECTIVES[choices.colorMode]);
  }
  if (choices.tone !== "auto") {
    directives.push(TONE_DIRECTIVES[choices.tone]);
  }
  return directives.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────
// Delad store (modul-singleton) — EN källa för aktuella val.
//
// Både panelen (skriver + initierar sin state härifrån) och `useCreateChat`
// (läser vid skapning, nollställer vid lyckad skapning) använder samma
// värde. Det gör att valen överlever att välkomstpanelen av-/ommonteras
// under en misslyckad skapning (panelen återfår dem vid remount), och att
// UI och skickade signaler aldrig kan desynka — tidigare event+ref-lösning
// hade båda felmoderna. Ingen re-render behövs utanför panelen, så en
// modulvariabel räcker (builder-ytan är en singleton-sida).
// ─────────────────────────────────────────────────────────────────────────

let currentInitBuildChoices: InitBuildChoices = DEFAULT_INIT_BUILD_CHOICES;

export function getCurrentInitBuildChoices(): InitBuildChoices {
  return currentInitBuildChoices;
}

export function setCurrentInitBuildChoices(choices: InitBuildChoices): void {
  currentInitBuildChoices = choices;
}

/** Called by useCreateChat after a successful create (choices consumed). */
export function resetInitBuildChoices(): void {
  currentInitBuildChoices = DEFAULT_INIT_BUILD_CHOICES;
}
