/**
 * Shared generation orchestration — single source of truth for context
 * preparation that own-engine consumers use.
 *
 * Resolves scaffold, builds system prompt context, and returns everything
 * needed so that callers never diverge in what signals reach the model.
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";
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
  buildDynamicContext,
  composeEngineSystemPrompt,
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
} from "./contract/pre-generation-contracts";
import { PROMPT_DUMP_CATEGORY, writeLatestPromptDump } from "./prompt-dump";
import {
  type GenerationInputPackage,
  computeLineageHash,
  serializePackageForDump,
} from "./generation-input-package";
import { deriveBuildSpec, type BuildSpec } from "./build-spec";

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
   * `init` = first generation (Deep Brief, full scaffold selection).
   * `followUp` = editing/refining an existing generation.
   * Default: inferred from persistedScaffoldId presence.
   */
  generationMode?: "init" | "followUp";
  /**
   * When true, do not lock scaffold selection to `persistedScaffoldId` — re-run auto/manual
   * resolution (e.g. clear-redesign follow-ups where the chat scaffold may be stale).
   */
  ignorePersistedScaffoldForMatch?: boolean;
  /**
   * When false, auto scaffold selection uses keyword matching only (no embedding API).
   * Default true. Used by CLI trace tools; production callers omit this.
   */
  embeddingScaffoldMatch?: boolean;
  /** Optional prompt strategy metadata from builder orchestration. */
  promptStrategyMeta?: Pick<PromptStrategyMeta, "strategy" | "promptType"> | null;
}

export interface OrchestrationBase {
  resolvedScaffold: ScaffoldManifest | null;
  scaffoldContext: string | undefined;
  routePlan: RoutePlan;
  preGenerationContracts: PreGenerationContractContext;
  capabilities: InferredCapabilities;
  buildSpec: BuildSpec;
  /** Combined scaffold + capability hints string for dynamic context */
  scaffoldAndCapability: string;
}

/**
 * Resolve scaffold, route plan, and contracts without building the full system prompt.
 * Use before a pre-generation contract gate so clarification does not pay for STATIC_CORE.
 */
export async function resolveOrchestrationBase(
  input: OrchestrationInput,
): Promise<OrchestrationBase> {
  const {
    prompt,
    buildIntent,
    scaffoldMode = "auto",
    scaffoldId = null,
    brief = null,
    persistedScaffoldId = null,
    contractAnswers = [],
    embeddingScaffoldMatch = true,
    generationMode,
    promptStrategyMeta = null,
    ignorePersistedScaffoldForMatch = false,
  } = input;

  let resolvedScaffold: ScaffoldManifest | null = null;

  const effectivePersistedScaffoldId =
    ignorePersistedScaffoldForMatch ? null : persistedScaffoldId;

  if (scaffoldMode === "off") {
    resolvedScaffold = null;
  } else if (scaffoldMode === "manual" && scaffoldId) {
    resolvedScaffold = getScaffoldById(scaffoldId);
  } else if (effectivePersistedScaffoldId) {
    resolvedScaffold = getScaffoldById(effectivePersistedScaffoldId);
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
  const resolvedMode = generationMode ?? (persistedScaffoldId ? "followUp" : "init");
  const buildSpec = deriveBuildSpec({
    prompt,
    buildIntent,
    generationMode: resolvedMode,
    resolvedScaffold,
    routePlan,
    preGenerationContracts,
    promptStrategyMeta,
  });
  let scaffoldContext: string | undefined;
  if (resolvedScaffold) {
    const briefStyleKeywords = Array.isArray((brief as { visualDirection?: { styleKeywords?: unknown } } | null)?.visualDirection?.styleKeywords)
      ? ((brief as { visualDirection?: { styleKeywords?: unknown[] } }).visualDirection?.styleKeywords
          ?.filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0) ?? [])
      : undefined;
    const serializeMode = detectScaffoldMode(prompt, briefStyleKeywords);
    scaffoldContext = serializeScaffoldForPrompt(resolvedScaffold, serializeMode, {
      maxChars: buildSpec.tokenBudgets.scaffoldChars,
      contextPolicy: buildSpec.contextPolicy,
    });
  }

  const scaffoldAndCapability = [scaffoldContext, capabilityHints]
    .filter(Boolean)
    .join("\n\n");

  return {
    resolvedScaffold,
    scaffoldContext,
    routePlan,
    preGenerationContracts,
    capabilities,
    buildSpec,
    scaffoldAndCapability,
  };
}

/**
 * Build full system prompt from a resolved orchestration base.
 */
export async function finalizeOrchestrationPrompts(
  base: OrchestrationBase,
  input: OrchestrationInput,
): Promise<{
  engineSystemPrompt: string;
  dynamicContext: string;
}> {
  const {
    prompt,
    buildIntent,
    brief = null,
    themeColors = null,
    imageGenerations = false,
    componentPalette = null,
    designThemePreset = null,
    designReferences = [],
    customInstructions,
    generationMode,
  } = input;

  const resolvedMode = generationMode ?? (input.persistedScaffoldId ? "followUp" : "init");

  const dynamicOpts: DynamicContextOptions = {
    intent: buildIntent,
    brief: brief as DynamicContextOptions["brief"],
    themeOverride: themeColors,
    imageGenerations,
    originalPrompt: prompt,
    scaffoldContext: base.scaffoldAndCapability || undefined,
    resolvedScaffold: base.resolvedScaffold,
    routePlan: base.routePlan,
    preGenerationContracts: base.preGenerationContracts,
    componentPalette,
    designThemePreset,
    designReferences,
    buildSpec: base.buildSpec,
    customInstructions,
    generationMode: resolvedMode,
  };

  const dynamic = await buildDynamicContext(dynamicOpts);
  const engineSystemPrompt = composeEngineSystemPrompt(dynamic.context);

  return {
    engineSystemPrompt,
    dynamicContext: dynamic.context,
  };
}

/**
 * Prepare all generation context in one place so that scaffold, brief,
 * theme, and intent flow identically across all own-engine callers.
 *
 * Returns a `GenerationInputPackage` — the canonical fan-in artifact
 * that captures every signal used to shape generation.
 */
export async function prepareGenerationContext(
  input: OrchestrationInput,
): Promise<GenerationInputPackage> {
  const base = await resolveOrchestrationBase(input);
  const { engineSystemPrompt, dynamicContext } = await finalizeOrchestrationPrompts(base, input);

  const capabilityHints = base.scaffoldAndCapability;
  const lineageHash = computeLineageHash({
    userPrompt: input.prompt,
    brief: input.brief,
    scaffoldMode: input.scaffoldMode ?? "auto",
    scaffoldContext: base.scaffoldContext,
    routePlan: base.routePlan,
    preGenerationContracts: base.preGenerationContracts,
    buildSpec: base.buildSpec,
    capabilityHints,
  });

  const pkg: GenerationInputPackage = {
    ...base,
    userPrompt: input.prompt,
    brief: (input.brief as Record<string, unknown>) ?? null,
    scaffoldMode: input.scaffoldMode ?? "auto",
    engineSystemPrompt,
    dynamicContext,
    lineageHash,
  };

  writeLatestPromptDump(
    PROMPT_DUMP_CATEGORY.orchestrationDynamic,
    {
      "latest.md": dynamicContext,
      "generation-input-package.json": JSON.stringify(
        serializePackageForDump(pkg),
        null,
        2,
      ),
    },
    {
      lineageHash,
      buildIntent: input.buildIntent,
      scaffoldId: base.resolvedScaffold?.id ?? null,
      scaffoldFamily: base.resolvedScaffold?.family ?? null,
      buildSpecChangeScope: base.buildSpec.changeScope,
      buildSpecContextPolicy: base.buildSpec.contextPolicy,
      buildSpecPreviewPolicy: base.buildSpec.previewPolicy,
      promptLength: input.prompt.length,
    },
  );

  return pkg;
}
