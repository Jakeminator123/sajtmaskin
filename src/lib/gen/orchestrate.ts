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
  matchScaffoldAuto,
  type ScaffoldQueryContext,
  type ScaffoldSelectionMeta,
} from "./scaffolds";
import {
  serializeScaffoldForPrompt,
} from "./scaffolds/serialize";
import {
  buildDynamicContext,
  type DynamicContextBlockTrace,
  composeEngineSystemPrompt,
  type DesignReferenceAsset,
  type DynamicContextOptions,
  type DynamicContextPruning,
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
import {
  buildOrchestrationContract,
  type OrchestrationContract,
} from "./orchestration-contract";
import { PROMPT_DUMP_CATEGORY, writeLatestPromptDump } from "./prompt-dump";
import {
  type GenerationInputPackage,
  computeLineageHash,
  serializePackageForDump,
} from "./generation-input-package";
import { deriveBuildSpec, type BuildSpec } from "./build-spec";
import { estimateCharsForTokens } from "./tokens";

export interface OrchestrationInput {
  prompt: string;
  /** Optional prompt used specifically for route-planning inference (defaults to `prompt`). */
  routePlanPrompt?: string;
  /** Optional prompt used for BuildSpec classification (defaults to `prompt`). */
  buildSpecPrompt?: string;
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
  /** Existing App Router paths from previous version files (follow-up route freeze/clamp). */
  existingRoutePaths?: string[];
  /** Optional pre-inferred capabilities so callers can reuse the same deterministic pass. */
  capabilities?: InferredCapabilities;
  /** Per-session seed (e.g. chatId) to vary style direction across sessions with identical prompts. */
  sessionSeed?: string;
}

export interface OrchestrationBase {
  resolvedScaffold: ScaffoldManifest | null;
  scaffoldSelection?: ScaffoldSelectionMeta;
  orchestrationContract: OrchestrationContract;
  scaffoldContext: string | undefined;
  capabilityHints: string | undefined;
  routePlan: RoutePlan;
  preGenerationContracts: PreGenerationContractContext;
  capabilities: InferredCapabilities;
  buildSpec: BuildSpec;
}

export interface FinalizedOrchestrationContext {
  engineSystemPrompt: string;
  dynamicContext: string;
  dynamicContextPruning: DynamicContextPruning;
  dynamicContextBlocks: DynamicContextBlockTrace[];
}

function buildScaffoldQueryContext(
  brief: Record<string, unknown> | null,
): ScaffoldQueryContext | undefined {
  if (!brief) return undefined;
  const briefPages = Array.isArray((brief as { pages?: unknown }).pages)
    ? ((brief as { pages?: Array<{ name?: unknown; path?: unknown; purpose?: unknown }> }).pages ?? [])
        .slice(0, 10)
        .map((page) => ({
          name: typeof page.name === "string" ? page.name.trim() : undefined,
          path: typeof page.path === "string" ? page.path.trim() : undefined,
          purpose: typeof page.purpose === "string" ? page.purpose.trim() : undefined,
        }))
    : [];
  const styleKeywords = Array.isArray((brief as { visualDirection?: { styleKeywords?: unknown } }).visualDirection?.styleKeywords)
    ? ((brief as { visualDirection?: { styleKeywords?: unknown[] } }).visualDirection?.styleKeywords ?? [])
        .filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0)
        .slice(0, 12)
    : [];
  const domainHints: string[] = [];
  const businessType = (brief as { businessType?: unknown }).businessType;
  if (typeof businessType === "string" && businessType.trim()) domainHints.push(businessType.trim());
  const industry = (brief as { industry?: unknown }).industry;
  if (typeof industry === "string" && industry.trim()) domainHints.push(industry.trim());
  if (briefPages.length === 0 && styleKeywords.length === 0 && domainHints.length === 0) {
    return undefined;
  }
  return {
    briefPages,
    styleKeywords,
    domainHints,
  };
}

export function buildGenerationInputPackage(
  base: OrchestrationBase,
  input: OrchestrationInput,
  finalized: FinalizedOrchestrationContext,
): GenerationInputPackage {
  const lineageHash = computeLineageHash({
    userPrompt: input.prompt,
    brief: input.brief,
    scaffoldMode: input.scaffoldMode ?? "auto",
    scaffoldContext: base.scaffoldContext,
    routePlan: base.routePlan,
    preGenerationContracts: base.preGenerationContracts,
    buildSpec: base.buildSpec,
    capabilityHints: base.capabilityHints,
  });

  return {
    ...base,
    userPrompt: input.prompt,
    brief: (input.brief as Record<string, unknown>) ?? null,
    scaffoldMode: input.scaffoldMode ?? "auto",
    engineSystemPrompt: finalized.engineSystemPrompt,
    dynamicContext: finalized.dynamicContext,
    dynamicContextPruning: finalized.dynamicContextPruning,
    dynamicContextBlocks: finalized.dynamicContextBlocks,
    lineageHash,
  };
}

export function writeOrchestrationDynamicDump(pkg: GenerationInputPackage): void {
  writeLatestPromptDump(
    PROMPT_DUMP_CATEGORY.orchestrationDynamic,
    {
      "latest.md": pkg.dynamicContext,
      "generation-input-package.json": JSON.stringify(
        serializePackageForDump(pkg),
        null,
        2,
      ),
    },
    {
      lineageHash: pkg.lineageHash,
      buildIntent: pkg.buildSpec.buildIntent,
      scaffoldId: pkg.resolvedScaffold?.id ?? null,
      scaffoldFamily: pkg.resolvedScaffold?.family ?? null,
      buildSpecChangeScope: pkg.buildSpec.changeScope,
      buildSpecContextPolicy: pkg.buildSpec.contextPolicy,
      buildSpecPreviewPolicy: pkg.buildSpec.previewPolicy,
      promptLength: pkg.userPrompt.length,
      dynamicContextBudgetTokens: pkg.dynamicContextPruning.budgetTokens,
      dynamicContextUsedTokens: pkg.dynamicContextPruning.usedTokens,
      dynamicContextDroppedBlocks: pkg.dynamicContextPruning.droppedBlockKeys,
    },
  );
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
    routePlanPrompt,
    buildSpecPrompt,
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
    existingRoutePaths = [],
    capabilities: providedCapabilities,
  } = input;

  let resolvedScaffold: ScaffoldManifest | null = null;
  let scaffoldSelection: ScaffoldSelectionMeta = {
    selectedScaffold: null,
    selectionMethod: scaffoldMode === "off" ? "off" : "default",
    selectionConfidence: "low",
    topCandidates: [],
    keywordScores: {},
    embeddingAvailable: false,
    embeddingFailed: false,
    embeddingTopResult: null,
    semanticUnavailableReason: null,
    embeddingOverrideReason: null,
    briefContextApplied: false,
  };

  const capabilities = providedCapabilities ?? inferCapabilities(prompt);
  const resolvedMode = generationMode ?? (persistedScaffoldId ? "followUp" : "init");

  const effectivePersistedScaffoldId =
    ignorePersistedScaffoldForMatch ? null : persistedScaffoldId;
  const scaffoldQueryContext = buildScaffoldQueryContext(brief);

  if (scaffoldMode === "off") {
    resolvedScaffold = null;
  } else if (scaffoldMode === "manual" && scaffoldId) {
    resolvedScaffold = getScaffoldById(scaffoldId);
    scaffoldSelection = {
      ...scaffoldSelection,
      selectedScaffold: resolvedScaffold?.id ?? null,
      selectionMethod: "manual",
      selectionConfidence: resolvedScaffold ? "high" : "low",
      topCandidates: resolvedScaffold
        ? [{ id: resolvedScaffold.id, score: 1, source: "keyword" }]
        : [],
    };
  } else if (effectivePersistedScaffoldId) {
    resolvedScaffold = getScaffoldById(effectivePersistedScaffoldId);
    scaffoldSelection = {
      ...scaffoldSelection,
      selectedScaffold: resolvedScaffold?.id ?? effectivePersistedScaffoldId,
      selectionMethod: "persisted",
      selectionConfidence: resolvedScaffold ? "high" : "low",
      topCandidates: [{ id: effectivePersistedScaffoldId, score: 1, source: "keyword" }],
    };
  } else if (scaffoldMode === "auto") {
    const autoSelection = await matchScaffoldAuto(prompt, buildIntent, {
      useEmbeddings: embeddingScaffoldMatch,
      queryContext: scaffoldQueryContext,
      capabilities,
      generationMode: resolvedMode,
      brief,
    });
    resolvedScaffold = autoSelection.scaffold;
    scaffoldSelection = autoSelection.meta;

    if (scaffoldSelection.semanticUnavailableReason) {
      console.info("[scaffold] scaffold_semantic_unavailable", {
        reason: scaffoldSelection.semanticUnavailableReason,
        fallbackScaffoldId: resolvedScaffold?.id ?? null,
        method: scaffoldSelection.selectionMethod,
      });
    }

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

  const capabilityHints = buildCapabilityHints(capabilities);
  const routePlan = buildRoutePlan({
    prompt: routePlanPrompt ?? prompt,
    buildIntent,
    brief,
    resolvedScaffold,
    generationMode: resolvedMode,
    existingRoutePaths,
  });
  const preGenerationContracts = inferPreGenerationContracts({
    prompt,
    buildIntent,
    brief,
    capabilities,
    contractAnswers,
  });
  const buildSpec = deriveBuildSpec({
    prompt: buildSpecPrompt ?? prompt,
    buildIntent,
    generationMode: resolvedMode,
    resolvedScaffold,
    routePlan,
    preGenerationContracts,
    promptStrategyMeta,
    capabilities,
  });
  const orchestrationContract = buildOrchestrationContract({
    resolvedScaffold,
    routePlan,
    buildSpec,
  });
  let scaffoldContext: string | undefined;
  if (resolvedScaffold) {
    const serializeMode =
      resolvedMode === "followUp" || buildSpec.contextPolicy === "heavy"
        ? "structural"
        : "inspirational";
    const scaffoldBudgetChars =
      buildSpec.tokenBudgets.scaffoldChars ??
      estimateCharsForTokens(buildSpec.tokenBudgets.scaffoldTokens ?? 6_250);
    scaffoldContext = serializeScaffoldForPrompt(resolvedScaffold, serializeMode, {
      maxChars: scaffoldBudgetChars,
      contextPolicy: buildSpec.contextPolicy,
      routePlan,
      capabilities,
    });
  }

  return {
    resolvedScaffold,
    scaffoldSelection,
    orchestrationContract,
    scaffoldContext,
    capabilityHints: capabilityHints || undefined,
    routePlan,
    preGenerationContracts,
    capabilities,
    buildSpec,
  };
}

/**
 * Build full system prompt from a resolved orchestration base.
 */
export async function finalizeOrchestrationPrompts(
  base: OrchestrationBase,
  input: OrchestrationInput,
): Promise<FinalizedOrchestrationContext> {
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
    scaffoldContext: base.scaffoldContext,
    capabilityHints: base.capabilityHints,
    resolvedScaffold: base.resolvedScaffold,
    routePlan: base.routePlan,
    preGenerationContracts: base.preGenerationContracts,
    componentPalette,
    designThemePreset,
    designReferences,
    buildSpec: base.buildSpec,
    customInstructions,
    generationMode: resolvedMode,
    sessionSeed: input.sessionSeed,
  };

  const dynamic = await buildDynamicContext(dynamicOpts);
  const engineSystemPrompt = composeEngineSystemPrompt(dynamic.context);

  return {
    engineSystemPrompt,
    dynamicContext: dynamic.context,
    dynamicContextPruning: dynamic.pruning,
    dynamicContextBlocks: dynamic.blocks,
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
  const finalized = await finalizeOrchestrationPrompts(base, input);
  const pkg = buildGenerationInputPackage(base, input, finalized);
  writeOrchestrationDynamicDump(pkg);

  return pkg;
}
