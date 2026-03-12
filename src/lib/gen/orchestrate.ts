/**
 * Shared generation orchestration — single source of truth for context
 * preparation that both the own engine and v0 fallback consume.
 *
 * Resolves scaffold, builds system prompt context, and returns everything
 * needed so that callers never diverge in what signals reach the model.
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { PaletteState } from "@/lib/builder/palette";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import type { ScaffoldManifest } from "./scaffolds/types";
import {
  getScaffoldById,
  matchScaffoldWithEmbeddings,
} from "./scaffolds";
import {
  serializeScaffoldForPrompt,
  detectScaffoldMode,
} from "./scaffolds/serialize";
import {
  buildSystemPrompt,
  buildDynamicContext,
  type DesignReferenceAsset,
  type DynamicContextOptions,
} from "./system-prompt";
import {
  inferCapabilities,
  buildCapabilityHints,
  type InferredCapabilities,
} from "./capability-inference";

export interface OrchestrationInput {
  prompt: string;
  buildIntent: BuildIntent;
  scaffoldMode?: "auto" | "manual" | "off";
  scaffoldId?: string | null;
  brief?: Record<string, unknown> | null;
  themeColors?: ThemeColors | null;
  imageGenerations?: boolean;
  componentPalette?: PaletteState | null;
  designThemePreset?: string | null;
  designReferences?: DesignReferenceAsset[];
  /** Optional persisted scaffold id from a previous turn in the same chat */
  persistedScaffoldId?: string | null;
  /** User-supplied custom instructions from the builder UI */
  customInstructions?: string;
}

export interface OrchestrationResult {
  resolvedScaffold: ScaffoldManifest | null;
  scaffoldContext: string | undefined;
  capabilities: InferredCapabilities;
  /** Full system prompt (STATIC_CORE + dynamic) for own engine */
  engineSystemPrompt: string;
  /** Dynamic-only context suitable for injecting into v0 fallback `system` */
  v0EnrichmentContext: string;
}

/**
 * Prepare all generation context in one place.
 *
 * Both the own engine path and the v0 fallback path should call this
 * so that scaffold, brief, theme, and intent flow identically.
 */
export async function prepareGenerationContext(
  input: OrchestrationInput,
): Promise<OrchestrationResult> {
  const {
    prompt,
    buildIntent,
    scaffoldMode = "auto",
    scaffoldId = null,
    brief = null,
    themeColors = null,
    imageGenerations = false,
    componentPalette = null,
    designThemePreset = null,
    designReferences = [],
    persistedScaffoldId = null,
    customInstructions,
  } = input;

  let resolvedScaffold: ScaffoldManifest | null = null;

  if (scaffoldMode === "off") {
    resolvedScaffold = null;
  } else if (scaffoldMode === "manual" && scaffoldId) {
    resolvedScaffold = getScaffoldById(scaffoldId);
  } else if (persistedScaffoldId) {
    resolvedScaffold = getScaffoldById(persistedScaffoldId);
  } else if (scaffoldMode === "auto") {
    resolvedScaffold = await matchScaffoldWithEmbeddings(prompt, buildIntent);
  }

  let scaffoldContext: string | undefined;
  if (resolvedScaffold) {
    const briefStyleKeywords = Array.isArray((brief as { visualDirection?: { styleKeywords?: unknown } } | null)?.visualDirection?.styleKeywords)
      ? ((brief as { visualDirection?: { styleKeywords?: unknown[] } }).visualDirection?.styleKeywords
          ?.filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0) ?? [])
      : undefined;
    const serializeMode = detectScaffoldMode(prompt, briefStyleKeywords);
    scaffoldContext = serializeScaffoldForPrompt(resolvedScaffold, serializeMode);
  }

  const capabilities = inferCapabilities(prompt);
  const capabilityHints = buildCapabilityHints(capabilities);

  const scaffoldAndCapability = [scaffoldContext, capabilityHints]
    .filter(Boolean)
    .join("\n\n");

  const dynamicOpts: DynamicContextOptions = {
    intent: buildIntent,
    brief: brief as DynamicContextOptions["brief"],
    themeOverride: themeColors,
    imageGenerations,
    originalPrompt: prompt,
    scaffoldContext: scaffoldAndCapability || undefined,
    componentPalette,
    designThemePreset,
    designReferences,
    customInstructions,
  };

  const engineSystemPrompt = await buildSystemPrompt({
    ...dynamicOpts,
  });

  const v0EnrichmentContext = await buildDynamicContext(dynamicOpts);

  return {
    resolvedScaffold,
    scaffoldContext,
    capabilities,
    engineSystemPrompt,
    v0EnrichmentContext,
  };
}
