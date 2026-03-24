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
  matchScaffold,
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
import { buildRoutePlan } from "./route-plan";
import type { RoutePlan } from "./route-plan";
import {
  type ConfirmedContractAnswer,
  inferPreGenerationContracts,
  type PreGenerationContractContext,
} from "./pre-generation-contracts";
import { PROMPT_DUMP_CATEGORY, writeLatestPromptDump } from "./prompt-dump";

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
  /** Previously confirmed contract answers reconstructed from chat history */
  contractAnswers?: ConfirmedContractAnswer[];
  /** User-supplied custom instructions from the builder UI */
  customInstructions?: string;
  /**
   * When false, auto scaffold selection uses keyword matching only (no embedding API).
   * Default true. Used by CLI trace tools; production callers omit this.
   */
  embeddingScaffoldMatch?: boolean;
  /**
   * When false, system prompt dynamic context skips semantic KB + embedding template refs.
   * Default true. Used by offline CLI traces.
   */
  embeddingEnrichment?: boolean;
}

export interface OrchestrationResult {
  resolvedScaffold: ScaffoldManifest | null;
  scaffoldContext: string | undefined;
  routePlan: RoutePlan;
  preGenerationContracts: PreGenerationContractContext;
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
    contractAnswers = [],
    customInstructions,
    embeddingScaffoldMatch = true,
    embeddingEnrichment = true,
  } = input;

  let resolvedScaffold: ScaffoldManifest | null = null;

  if (scaffoldMode === "off") {
    resolvedScaffold = null;
  } else if (scaffoldMode === "manual" && scaffoldId) {
    resolvedScaffold = getScaffoldById(scaffoldId);
  } else if (persistedScaffoldId) {
    resolvedScaffold = getScaffoldById(persistedScaffoldId);
  } else if (scaffoldMode === "auto") {
    resolvedScaffold = embeddingScaffoldMatch
      ? await matchScaffoldWithEmbeddings(prompt, buildIntent)
      : matchScaffold(prompt, buildIntent);

    if (
      resolvedScaffold &&
      (resolvedScaffold.id === "landing-page" || resolvedScaffold.id === "base-nextjs")
    ) {
      try {
        const { getScaffoldBoost } = await import("./scaffolds/scaffold-scoring");
        const boost = await getScaffoldBoost(resolvedScaffold.id);
        if (boost <= -2) {
          console.info(
            "[orchestrate] Generic scaffold %s has poor telemetry (boost=%d), keeping it but noting for retry",
            resolvedScaffold.id,
            boost,
          );
        }
      } catch {
        /* best-effort telemetry check */
      }
    }
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
  const routePlan = buildRoutePlan({
    prompt,
    buildIntent,
    brief,
    resolvedScaffold,
  });
  const preGenerationContracts = inferPreGenerationContracts({
    prompt,
    buildIntent,
    brief,
    capabilities,
    contractAnswers,
  });

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
    resolvedScaffold,
    routePlan,
    preGenerationContracts,
    componentPalette,
    designThemePreset,
    designReferences,
    customInstructions,
    embeddingEnrichment,
  };

  const engineSystemPrompt = await buildSystemPrompt({
    ...dynamicOpts,
  });

  const v0EnrichmentContext = await buildDynamicContext(dynamicOpts);

  writeLatestPromptDump(
    PROMPT_DUMP_CATEGORY.orchestrationDynamic,
    { "latest.md": v0EnrichmentContext },
    {
      buildIntent,
      scaffoldId: resolvedScaffold?.id ?? null,
      scaffoldFamily: resolvedScaffold?.family ?? null,
      promptLength: prompt.length,
    },
  );

  return {
    resolvedScaffold,
    scaffoldContext,
    routePlan,
    preGenerationContracts,
    capabilities,
    engineSystemPrompt,
    v0EnrichmentContext,
  };
}
