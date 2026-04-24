/**
 * Public + internal types for `system-prompt/`.
 *
 * Split out of `system-prompt.ts` (OMTAG-03 wave-rest) — no behavior change.
 * All types below are re-exported by `index.ts`; callers should continue to
 * import them from `@/lib/gen/system-prompt` (barrel-stable).
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { PaletteState } from "@/lib/builder/palette";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import type { BuildSpec } from "../build-spec";
import type { PreGenerationContractContext } from "../contract/pre-generation-contracts";
import type { ScaffoldVariant } from "../scaffold-variants";
import type { RoutePlan } from "../route-plan";
import type { ScaffoldManifest } from "../scaffolds/types";
import type { PromptBudgetBlock } from "../tokens";
import type { DossierSelectionResult } from "../dossiers";

export interface Brief {
  projectTitle?: string;
  brandName?: string;
  oneSentencePitch?: string;
  tagline?: string;
  targetAudience?: string;
  primaryCallToAction?: string;
  toneAndVoice?: string[];
  visualDirection?: {
    styleKeywords?: string[];
    colorPalette?: {
      primary?: string;
      secondary?: string;
      accent?: string;
      background?: string;
      text?: string;
    };
    typography?: {
      headings?: string;
      body?: string;
    };
  };
  pages?: Array<{
    name?: string;
    path?: string;
    purpose?: string;
    sections?: Array<{
      type?: string;
      heading?: string;
      bullets?: string[];
    }>;
  }>;
  imagery?: {
    styleKeywords?: string[];
    suggestedSubjects?: string[];
    styleNotes?: string[];
    subjects?: string[];
    shotTypes?: string[];
    altTextRules?: string[];
  };
  domainProfile?: string;
  motionLevel?: "minimal" | "moderate" | "lively";
  qualityBar?: "clean" | "premium" | "bold-dramatic";
  seasonalHints?: string[];
  mustHave?: string[];
  avoid?: string[];
  uiNotes?: {
    components?: string[];
    interactions?: string[];
    accessibility?: string[];
  };
  seo?: {
    titleTemplate?: string;
    metaDescription?: string;
    keywords?: string[];
  };
  siteName?: string;
  /** Brief-LLM nominated scaffold (Fas 1.0). Hint — runtime embedding-pick may override. */
  scaffoldNomination?: {
    id: string;
    reason: string;
    confidence: number;
  } | null;
  /** Brief-LLM nominated variant (Fas 1.0). Hint — only meaningful if scaffoldNomination set. */
  variantNomination?: {
    id: string;
    reason: string;
    confidence: number;
  } | null;
  /**
   * Capabilities the brief-LLM declared the site needs (v2 dossier system).
   * Each capability resolves to one dossier (or none) at runtime via
   * `selectDossiersForRequest`. Free-form kebab-case strings.
   */
  requestedCapabilities?: string[];
}

export interface MediaCatalogItem {
  alias: string;
  url: string;
  alt?: string;
}

export interface DesignReferenceAsset {
  kind: "figma" | "image";
  label: string;
  note?: string;
}

export interface DynamicContextOptions {
  intent: BuildIntent;
  brief?: Brief | null;
  themeOverride?: ThemeColors | null;
  imageGenerations?: boolean;
  mediaCatalog?: MediaCatalogItem[];
  scaffoldContext?: string;
  capabilityHints?: string;
  resolvedScaffold?: ScaffoldManifest | null;
  resolvedVariant?: ScaffoldVariant | null;
  routePlan?: RoutePlan | null;
  preGenerationContracts?: PreGenerationContractContext | null;
  componentPalette?: PaletteState | null;
  designThemePreset?: string | null;
  designReferences?: DesignReferenceAsset[];
  /** User-supplied custom instructions from the builder UI */
  customInstructions?: string;
  /** Raw user prompt text — used for domain/motion/quality inference. */
  userPrompt?: string;
  /** `init` = first gen (rich brief), `followUp` = delta-only editing. */
  generationMode?: "init" | "followUp";
  buildSpec?: BuildSpec | null;
  /** Per-session seed (chatId or similar) to vary scaffold variant selection across sessions with identical prompts. */
  sessionSeed?: string;
  /**
   * Chat id — used for the Phase 2D `### Recurring failures on this site`
   * block. Must be the real chat id (not a hashed seed) because we need it
   * to read `logs/site-observability/<chatId>/latest/fix-patterns.json`.
   * Optional so legacy callers (eval/runner, snapshot tests) compile
   * unchanged; the block is silently skipped when missing.
   */
  chatId?: string | null;
  /** Verified shadcn usage examples matched to this request's capabilities. */
  componentReferences?: { name: string; code: string }[];
  /** Dossier-poolen (legoklossar) selected for this request — opt-in via FEATURES.useDossierPipeline. */
  dossierSelection?: DossierSelectionResult | null;
  /**
   * Plan 11 / open-question #12: when the follow-up was classified as
   * `capability-modify` (user named a dossier capability AND referenced
   * an existing on-page element such as "pricken" / "den 3D-grejen"),
   * the dossier-shell pipeline is intentionally suppressed upstream and
   * this hint instead instructs the LLM to mutate the existing scene
   * file rather than emit a fresh placeholder shell. Rendered as a
   * dedicated block by `renderCapabilityModifyHintBlock` so the
   * instruction is visible without competing with the regular dossier
   * "Available Dossiers" list.
   */
  capabilityModifyHint?: {
    capabilityIds: string[];
    references: string[];
  } | null;
}

/** Observability for dynamic-context token budgeting (`buildBudgetedSystemPrompt`). */
export interface DynamicContextPruning {
  budgetTokens: number;
  usedTokens: number;
  droppedBlockKeys: string[];
  keptBlockKeys: string[];
}

export interface DynamicContextBlockTrace {
  key: string;
  title: string;
  priority: number;
  required: boolean;
  estimatedTokens: number;
  kept: boolean;
}

export type BuildDynamicContextResult = {
  context: string;
  pruning: DynamicContextPruning;
  blocks: DynamicContextBlockTrace[];
  variantId: string | null;
};

/** Internal: block shape consumed by the budget splitter. */
export type DynamicContextBlock = PromptBudgetBlock & {
  title: string;
  estimatedTokens: number;
};
