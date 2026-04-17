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
   * boilerplate across variants. See `docs/architecture/scaffold-variants-inventory.md`.
   */
  promptHints: string[];
  themeTokens?: ScaffoldVariantThemeTokens;
  /**
   * Curated dossier ids whose `selectedFiles` are eligible as structural
   * references when `SAJTMASKIN_VARIANT_STRUCTURAL_FILES` is enabled.
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
