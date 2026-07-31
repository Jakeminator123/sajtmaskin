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
  landing: "Sajten är en landningssida (hemsida för företaget).",
  portfolio: "Sajten är en portfolio.",
  blog: "Sajten är en blogg.",
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
  editorial: "Stil: editorial, som ett magasin.",
  minimal: "Stil: minimal och ren design.",
};

const COLOR_MODE_FRAGMENTS: Record<Exclude<ColorModeChoice, "auto">, string> = {
  light: "Använd ett ljust färgtema.",
  dark: "Använd ett mörkt färgtema.",
};

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
