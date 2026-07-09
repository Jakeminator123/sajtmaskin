import type { ScaffoldId } from "../scaffolds/types";

export type ScaffoldVariantId = string;

export type FontPairing = {
  heading: string;
  body: string;
};

export interface ScaffoldVariantThemeTokens {
  background?: string;
  foreground?: string;
  card?: string;
  cardForeground?: string;
  primary?: string;
  primaryForeground?: string;
  secondary?: string;
  secondaryForeground?: string;
  muted?: string;
  mutedForeground?: string;
  accent?: string;
  accentForeground?: string;
  border?: string;
  ring?: string;
  radius?: string;
  bodyBackgroundImage?: string;
}

/**
 * Concrete, hand- or LLM-curated visual signatures for a variant. Replaces
 * the four generic guidance fields (styleRules, sectionInventory,
 * avoidPatterns, worldClassRubric) removed 2026-04-17 — those produced
 * boilerplate. signaturePatterns are required to be SPECIFIC: layouts must
 * read like "asymmetric hero with floating product card" rather than
 * "modern layout"; motifs like "2px hairline borders + 1rem radius" rather
 * than "subtle design"; antiPatterns like "never use gradient buttons on
 * auth surfaces" rather than "bad patterns".
 *
 * Populated by scripts/scaffolds/auto-curate-variant-patterns.ts.
 */
export interface ScaffoldVariantSignaturePatterns {
  /** 3-5 concrete layout choices the variant prefers. */
  layouts: string[];
  /** 2-3 visual motifs that read at first glance. */
  motifs: string[];
  /** 2-3 patterns the LLM should NOT use for this variant. */
  antiPatterns: string[];
}

export interface ScaffoldVariant {
  id: ScaffoldVariantId;
  scaffoldId: ScaffoldId;
  label: string;
  description?: string;
  keywords: string[];
  fontPairings: FontPairing[];
  signatureMotif: string;
  colorMode: "light" | "dark" | "either";
  /**
   * Short, scaffold-specific cues for the LLM (e.g. "Lead with editorial framing,
   * not feature cards"). Only fields with high signal — generic guidance fields
   * (styleRules, sectionInventory, avoidPatterns, worldClassRubric) were removed
   * 2026-04-17 because the regelmotor-driven aggregation produced near-identical
   * boilerplate across variants. See `docs/contracts/scaffold-system.md`.
   */
  promptHints: string[];
  /**
   * Concrete layouts/motifs/antiPatterns. Optional during migration; once
   * auto-curate-variant-patterns.ts has filled all 21 variants this becomes
   * effectively required for prompt rendering.
   */
  signaturePatterns?: ScaffoldVariantSignaturePatterns;
  themeTokens?: ScaffoldVariantThemeTokens;
  /**
   * Inspiration reference ids. New entries are v0-mall Blob ids resolved
   * against `src/lib/templates/template-blob-manifest.json` (written by the
   * backoffice Scaffold Wizard); older entries are harmless legacy labels
   * from the removed external-template pipeline. Runtime only renders them
   * as a "Derived from curated references" prompt line — nothing is injected.
   */
  sourceTemplateIds?: string[];
  default?: boolean;
}

export interface PickScaffoldVariantInput {
  prompt: string;
  scaffoldId?: ScaffoldId | null;
  styleKeywords?: string[];
  toneKeywords?: string[];
  generationMode?: "init" | "followUp";
  sessionSeed?: string;
}
