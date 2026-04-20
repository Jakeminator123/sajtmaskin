import {
  extractAppProjectIdFromMeta,
  extractBriefFromMeta,
  extractDesignThemePresetFromMeta,
  extractPaletteStateFromMeta,
  extractScaffoldSettingsFromMeta,
  extractThemeColorsFromMeta,
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
  promptSourceKind: string | null;
  promptSourceTechnical: boolean;
  promptSourcePreservePayload: boolean;
  planMode: boolean;
  appProjectId: string | null;
  scaffoldMode: ScaffoldMode;
  scaffoldId: string | null;
  themeColors: ThemeColors | null;
  brief: Record<string, unknown> | null;
  designThemePreset: string | null;
  palette: PaletteState | null;
  promptAssistModel: string | null;
  promptAssistDeep: boolean | null;
  promptAssistMode: "polish" | "rewrite" | null;
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

  const promptAssistModeRaw = metaString(meta, "promptAssistMode");
  const promptAssistMode =
    promptAssistModeRaw === "polish" || promptAssistModeRaw === "rewrite"
      ? promptAssistModeRaw
      : null;

  return {
    modelTier: metaString(meta, "modelTier"),
    buildMethod: metaString(meta, "buildMethod"),
    buildIntent: metaString(meta, "buildIntent"),
    promptSourceKind: metaString(meta, "promptSourceKind"),
    promptSourceTechnical: metaBool(meta, "promptSourceTechnical"),
    promptSourcePreservePayload: metaBool(meta, "promptSourcePreservePayload"),
    planMode: metaBool(meta, "planMode"),
    appProjectId: extractAppProjectIdFromMeta(meta),
    scaffoldMode,
    scaffoldId,
    themeColors: extractThemeColorsFromMeta(meta),
    brief: extractBriefFromMeta(meta),
    designThemePreset: extractDesignThemePresetFromMeta(meta),
    palette: extractPaletteStateFromMeta(meta),
    promptAssistModel: metaString(meta, "promptAssistModel")?.trim() || null,
    promptAssistDeep: metaBoolOrNull(meta, "promptAssistDeep"),
    promptAssistMode,
    engineBaseVersionId: metaString(meta, "engineBaseVersionId")?.trim() || null,
    lifecycleStage:
      metaString(meta, "lifecycleStage") === "integrations" ? "integrations" : "design",
    parentVersionId: metaString(meta, "parentVersionId")?.trim() || null,
  };
}
