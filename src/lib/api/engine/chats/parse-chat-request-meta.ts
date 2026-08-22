import {
  extractAppProjectIdFromMeta,
  extractBriefFromMeta,
  extractColorModeHintFromMeta,
  extractComplexityHintFromMeta,
  extractDesignThemePresetFromMeta,
  extractPageCountHintFromMeta,
  extractPaletteStateFromMeta,
  extractScaffoldSettingsFromMeta,
  extractStyleChoiceHintFromMeta,
  extractStyleKeywordsHintFromMeta,
  extractThemeColorsFromMeta,
  extractToneKeywordsHintFromMeta,
} from "@/lib/gen/request-metadata";
import type { ScaffoldMode } from "@/lib/gen/scaffolds/types";
import type { PaletteState } from "@/lib/builder/palette";
import type { ThemeColors } from "@/lib/builder/theme-presets";
function metaString(meta: unknown, key: string): string | null {
  const obj = meta as Record<string, unknown> | null | undefined;
  return typeof obj?.[key] === "string" ? String(obj[key]) : null;
}

function metaBool(meta: unknown, key: string): boolean {
  const obj = meta as Record<string, unknown> | null | undefined;
  return obj?.[key] === true;
}

function metaBoolOrNull(meta: unknown, key: string): boolean | null {
  const obj = meta as Record<string, unknown> | null | undefined;
  return typeof obj?.[key] === "boolean" ? Boolean(obj[key]) : null;
}

export interface ParsedChatRequestMeta {
  modelTier: string | null;
  buildMethod: string | null;
  buildIntent: string | null;
  /**
   * Byggval: the user picked Hemsida/App themselves. Distinguishes a decision
   * from the intent inherited from the landing entry, which is what the
   * website→app promotion is allowed to override.
   */
  buildIntentExplicit: boolean;
  promptSourceKind: string | null;
  promptSourceTechnical: boolean;
  promptSourcePreservePayload: boolean;
  planDesignLineageHash: string | null;
  planMode: boolean;
  appProjectId: string | null;
  scaffoldMode: ScaffoldMode;
  scaffoldId: string | null;
  /** Byggval (init controls): structured page-count hint (1–20) for the route plan. */
  pageCountHint: number | null;
  /** Byggval (init controls): structured style keywords for variant matching. */
  styleKeywordsHint: string[];
  /** Byggval (init controls): structured tone keywords for variant matching. */
  toneKeywordsHint: string[];
  /**
   * Byggval (init controls): the raw style choice. Resolved to a concrete variant
   * id server-side once the scaffold is known, then pinned.
   */
  styleChoiceHint: "warm" | "corporate" | "bold" | "editorial" | "minimal" | null;
  /** Byggval (init controls): ljust/mörkt, selects the color cluster's palette. */
  colorModeHint: "light" | "dark" | null;
  /** Byggval (init controls): structured complexity choice for BuildSpec. */
  complexityHint: "simple" | "medium" | "complex" | null;
  themeColors: ThemeColors | null;
  brief: Record<string, unknown> | null;
  designThemePreset: string | null;
  palette: PaletteState | null;
  promptAssistModel: string | null;
  promptAssistDeep: boolean | null;
  engineBaseVersionId: string | null;
  /**
   * F2/F3 lifecycle stage. `"integrations"` is set by the
   * `/finalize-design` route after Tier-3 readiness has passed; the
   * stream pipeline propagates it to `BuildSpec.previewPolicyOverride`
   * and to `engine_versions.lifecycle_stage`. Defaults to `"design"`.
   */
  lifecycleStage: "design" | "integrations";
  /**
   * F3 only: id of the F2 version this build is forked from.
   * Stored as `engine_versions.parent_version_id`.
   */
  parentVersionId: string | null;
}

/**
 * Parse the `meta` field from a chat request body.
 * Extracts all known meta properties with type-safe accessors,
 * replacing the duplicated typeof/cast patterns in both handlers.
 */
export function parseChatRequestMeta(meta: unknown): ParsedChatRequestMeta {
  const { scaffoldMode, scaffoldId } = extractScaffoldSettingsFromMeta(meta);

  return {
    modelTier: metaString(meta, "modelTier"),
    buildMethod: metaString(meta, "buildMethod"),
    buildIntent: metaString(meta, "buildIntent"),
    buildIntentExplicit: metaBool(meta, "buildIntentExplicit"),
    promptSourceKind: metaString(meta, "promptSourceKind"),
    promptSourceTechnical: metaBool(meta, "promptSourceTechnical"),
    promptSourcePreservePayload: metaBool(meta, "promptSourcePreservePayload"),
    planDesignLineageHash: metaString(meta, "planDesignLineageHash")?.trim() || null,
    planMode: metaBool(meta, "planMode"),
    appProjectId: extractAppProjectIdFromMeta(meta),
    scaffoldMode,
    scaffoldId,
    pageCountHint: extractPageCountHintFromMeta(meta),
    styleKeywordsHint: extractStyleKeywordsHintFromMeta(meta),
    toneKeywordsHint: extractToneKeywordsHintFromMeta(meta),
    styleChoiceHint: extractStyleChoiceHintFromMeta(meta),
    colorModeHint: extractColorModeHintFromMeta(meta),
    complexityHint: extractComplexityHintFromMeta(meta),
    themeColors: extractThemeColorsFromMeta(meta),
    brief: extractBriefFromMeta(meta),
    designThemePreset: extractDesignThemePresetFromMeta(meta),
    palette: extractPaletteStateFromMeta(meta),
    promptAssistModel: metaString(meta, "promptAssistModel")?.trim() || null,
    promptAssistDeep: metaBoolOrNull(meta, "promptAssistDeep"),
    engineBaseVersionId: metaString(meta, "engineBaseVersionId")?.trim() || null,
    lifecycleStage:
      metaString(meta, "lifecycleStage") === "integrations" ? "integrations" : "design",
    parentVersionId: metaString(meta, "parentVersionId")?.trim() || null,
  };
}
