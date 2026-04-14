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
  promptHints: string[];
  styleRules?: string[];
  sectionInventory?: string[];
  avoidPatterns?: string[];
  worldClassRubric?: string[];
  themeTokens?: ScaffoldVariantThemeTokens;
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
