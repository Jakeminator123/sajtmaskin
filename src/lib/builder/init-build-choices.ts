/**
 * Byggval — init controls in the preview panel's welcome state.
 *
 * All wiring is structured (2026-07-31, ägarbeslut: no prompt-text injection
 * into the chat input). Every choice has a real receiver:
 *
 * - Hemsida/App → `meta.buildIntent`, and it filters which site types are shown.
 * - Site type → `meta.scaffoldMode: "manual"` + `meta.scaffoldId`
 *   (manual scaffold selection in orchestrate).
 * - Page count → `meta.pageCountHint` — `buildRoutePlan` prefers it over the
 *   prompt-text regex (`detectExplicitPageCount`) and caps it at
 *   `MAX_ROUTES_PER_GENERATION`.
 * - Style → `meta.styleChoiceHint`, resolved server-side to a concrete variant id
 *   and pinned via `persistedVariantId`; plus `meta.styleKeywordsHint` for the
 *   pairs the map leaves unmapped.
 * - Tone → `meta.toneKeywordsHint` into variant matching, plus a Swedish copy
 *   directive.
 * - Color mode → `meta.colorModeHint` (picks the color cluster's light/dark
 *   palette) and `meta.styleKeywordsHint`.
 * - Complexity → `meta.complexityHint` into `deriveBuildSpec` (`complex`
 *   floors qualityTarget at premium + heavy context-bias; `simple` biases
 *   context lighter) AND a Swedish section-count directive (below).
 * - Complexity / color mode / tone → Swedish LLM directives appended to the
 *   custom-instructions channel (`body.system` → `customInstructions` →
 *   dynamic context) — structured, never touches the visible chat input.
 *
 * The Färg control is NOT part of this module — it reuses the existing
 * `designTheme`/`themeColors` shell state, which follow-ups also carry.
 */

import { SCAFFOLD_CLIENT_LIST } from "@/lib/gen/scaffolds/scaffold-client-list.generated";

/**
 * Hemsida vs App. Maps onto the existing `BuildIntent` (`website` | `app`), which
 * the engine has always had but no builder control ever exposed — it was decided
 * by which landing entry the user came through, plus an auto-promotion when the
 * scaffold matcher landed on a dashboard.
 *
 * `template` is deliberately absent: that intent belongs to the gallery import
 * path, not to a freeform build.
 */
export type BuildTargetChoice = "auto" | "website" | "app";

export type SiteTypeChoice =
  | "auto"
  | "starter"
  | "landing"
  | "saas"
  | "portfolio"
  | "blog"
  | "shop"
  | "dashboard"
  | "appshell"
  | "auth";

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
  /** Hemsida eller App — narrows which site types are offered. */
  buildTarget: BuildTargetChoice;
  siteType: SiteTypeChoice;
  /** 0 = auto (no preference), otherwise 1–MAX_PAGE_COUNT_CHOICE. */
  pageCount: number;
  complexity: ComplexityChoice;
  style: StyleChoice;
  colorMode: ColorModeChoice;
  /** Copy/voice tone for the generated texts. */
  tone: ToneChoice;
}

export const DEFAULT_INIT_BUILD_CHOICES: InitBuildChoices = {
  buildTarget: "auto",
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
 * quality. The route plan uses a per-round ceiling of 4 level-1/2 pages
 * (2026-08-14) and keeps pages the user named in the prompt and required
 * scaffold companions; an absolute brake of 8 still caps a long name-list.
 */
export const MAX_PAGE_COUNT_CHOICE = 3;

/** Scaffold ids per site-type choice (must resolve in the scaffold registry). */
export const SITE_TYPE_SCAFFOLD_IDS: Record<Exclude<SiteTypeChoice, "auto">, string> = {
  starter: "base-nextjs",
  landing: "landing-page",
  saas: "saas-landing",
  portfolio: "portfolio",
  blog: "blog",
  shop: "ecommerce",
  dashboard: "dashboard",
  appshell: "app-shell",
  auth: "auth-pages",
};

/**
 * Whether a site type can be built for the chosen target.
 *
 * The allow-list lives on the scaffold manifests and is generated into
 * `SCAFFOLD_CLIENT_LIST` (byte- and parity-gated) so this stays client-safe.
 * Offering Dashboard under "Hemsida" would be a dead end: the
 * matcher's app branch and the embedding guards both refuse that combination.
 */
export function isSiteTypeAllowedForTarget(
  siteType: SiteTypeChoice,
  target: BuildTargetChoice,
): boolean {
  if (siteType === "auto") return true;
  // Anything other than a real target means "no preference expressed", so nothing
  // is filtered. Checking for `"auto"` alone would let a missing value fall into
  // the allow-list lookup below and hide every chip.
  if (target !== "website" && target !== "app") return true;
  const scaffoldId = SITE_TYPE_SCAFFOLD_IDS[siteType];
  const entry = SCAFFOLD_CLIENT_LIST.find((scaffold) => scaffold.id === scaffoldId);
  return entry ? entry.allowedBuildIntents.includes(target) : false;
}

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

// English tokens matching variant `keywords`, same channel as the style hints.
// Tone used to reach the model ONLY as a Swedish sentence in custom instructions,
// which meant it never touched variant matching at all — the scorer reads
// `toneKeywords`, and nothing filled them unless a Deep Brief ran.
const TONE_KEYWORD_HINTS: Record<Exclude<ToneChoice, "auto">, string[]> = {
  professional: ["professional", "trust", "corporate"],
  warm: ["warm", "friendly", "community"],
  playful: ["playful", "bold", "energetic"],
};

export interface InitBuildChoicesMeta {
  scaffoldId?: string;
  /** Byggval Hemsida/App → `BuildIntent`. Overrides the entry-derived intent. */
  buildIntent?: "website" | "app";
  /**
   * Marks the intent above as a user decision, not an inherited default. Without
   * it an explicit "Hemsida" could still be promoted to `app` by the auto-matcher
   * landing on a dashboard.
   */
  buildIntentExplicit?: true;
  pageCountHint?: number;
  styleKeywordsHint?: string[];
  /**
   * The raw style choice, resolved server-side to a concrete variant id once the
   * scaffold is known. Sent alongside `styleKeywordsHint` rather than replacing
   * it: the keywords still steer the brief and any scaffold/style pair the map
   * deliberately leaves unmapped.
   */
  styleChoiceHint?: Exclude<StyleChoice, "auto">;
  toneKeywordsHint?: string[];
  /** Ljust/mörkt, needed server-side to pick the color cluster's palette. */
  colorModeHint?: "light" | "dark";
  /** Mirrors `BuildSpecComplexityHint` on the server. */
  complexityHint?: "simple" | "medium" | "complex";
}

/** Structured request-meta signals for the current choices ({} when all auto). */
export function buildInitBuildChoicesMeta(choices: InitBuildChoices): InitBuildChoicesMeta {
  const meta: InitBuildChoicesMeta = {};
  // An explicit site type that contradicts the target is dropped rather than
  // sent. The UI hides those chips, so this only fires for a choices object the
  // panel did not produce — but shipping the contradiction would put an app-only
  // scaffold behind a website intent, which `allowedBuildIntents` forbids.
  if (
    choices.siteType !== "auto" &&
    isSiteTypeAllowedForTarget(choices.siteType, choices.buildTarget)
  ) {
    meta.scaffoldId = SITE_TYPE_SCAFFOLD_IDS[choices.siteType];
  }
  // Positive check, not `!== "auto"`. A partial `InitBuildChoices` with no
  // `buildTarget` also fails a negative check, which would set the explicit flag
  // with no intent to go with it — `useCreateChat` would then send the
  // landing-derived intent marked as a user decision, suppressing promotion and
  // rejecting app scaffolds on a choice nobody made.
  if (choices.buildTarget === "website" || choices.buildTarget === "app") {
    meta.buildIntent = choices.buildTarget;
    meta.buildIntentExplicit = true;
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
  if (choices.style !== "auto") {
    meta.styleChoiceHint = choices.style;
  }
  if (choices.tone !== "auto") {
    meta.toneKeywordsHint = TONE_KEYWORD_HINTS[choices.tone];
  }
  if (choices.colorMode !== "auto") {
    meta.colorModeHint = choices.colorMode;
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
