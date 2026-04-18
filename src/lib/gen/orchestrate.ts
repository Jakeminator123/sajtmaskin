/**
 * Shared generation orchestration — single source of truth for context
 * preparation that own-engine consumers use.
 *
 * Resolves scaffold, builds system prompt context, and returns everything
 * needed so that callers never diverge in what signals reach the model.
 */
import { isAppScaffold, type BuildIntent } from "@/lib/builder/build-intent";
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";
import type { PaletteState } from "@/lib/builder/palette";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import {
  pickScaffoldVariantAsync,
  getVariantById,
  type ScaffoldVariant,
} from "./scaffold-variants";
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
import { FEATURES } from "@/lib/config";
import { getRelevantExampleNames, getPromptDrivenExampleNames } from "./data/shadcn-example-map";
import { loadShadcnExamples, type ComponentReference } from "./data/shadcn-example-loader";
import { fetchMissingRegistryExamples } from "./data/shadcn-registry-fetch";
import { fetchCommunityBlocks } from "./data/community-registry-fetch";
import { selectDossiersForRequest, type DossierSelectionResult } from "./dossiers";

export interface OrchestrationInput {
  prompt: string;
  /** Optional prompt used specifically for route-planning inference (defaults to `prompt`). */
  routePlanPrompt?: string;
  /** Optional prompt used for BuildSpec classification (defaults to `prompt`). */
  buildSpecPrompt?: string;
  /**
   * Optional prompt used for dossier-pick embedding query (defaults to `prompt`).
   * QW-1: stream callers should pass the *raw* user message here, not the
   * file-context-wrapped optimizedMessage — wrapped prompts contain previous
   * file content that drowns out the user's actual intent and biases dossier
   * embedding ranking toward whatever libraries the previous files imported.
   */
  dossierPickPrompt?: string;
  /**
   * Optional prompt used for pre-generation contract inference (defaults to `prompt`).
   * QW-1: same reasoning as `dossierPickPrompt` — wrapped prompts cause false
   * positives where contract inference triggers on provider names that only
   * appear because previous files imported them, not because the user wants
   * that integration.
   */
  contractsPrompt?: string;
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
  /** Route paths whose existing content is a deferred shell page (auto-detected from file content). */
  existingShellRoutePaths?: string[];
  /** Optional pre-inferred capabilities so callers can reuse the same deterministic pass. */
  capabilities?: InferredCapabilities;
  /** Per-session seed (e.g. chatId) to vary scaffold variant selection across sessions with identical prompts. */
  sessionSeed?: string;
  /** Variant id from a previous generation's snapshot — reused on follow-ups to prevent variant drift. */
  persistedVariantId?: string | null;
  /**
   * True when this is the first real code generation in a chat that already has a
   * persistedScaffoldId (e.g. after a contract gate turn). Allows init-only features
   * like template guidance to activate even though generationMode resolves to "followUp".
   */
  isFirstCodeGeneration?: boolean;
  /**
   * F2/F3 lifecycle stage. `"integrations"` triggers F3:
   * `BuildSpec.previewPolicyOverride: "fidelity3"` and the dynamic
   * context block `## Tier-3 Integration Build Plan` is rendered.
   * Defaults to `"design"` (F2) when unset.
   */
  lifecycleStage?: "design" | "integrations";
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
  serializeMode: "inspirational" | "structural" | null;
  componentReferences: ComponentReference[];
  /** Selected dossiers when FEATURES.useDossierPipeline is on, else null/undefined. Optional to keep test fixtures backward-compatible. */
  dossierSelection?: DossierSelectionResult | null;
}

export interface FinalizedOrchestrationContext {
  engineSystemPrompt: string;
  dynamicContext: string;
  dynamicContextPruning: DynamicContextPruning;
  dynamicContextBlocks: DynamicContextBlockTrace[];
  variantId: string | null;
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
    customInstructions: input.customInstructions ?? null,
    themeColors: input.themeColors ?? null,
    componentPalette: input.componentPalette ?? null,
    designReferences: input.designReferences ?? null,
    variantId: finalized.variantId,
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
    variantId: finalized.variantId,
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
      buildSpecChangeScope: pkg.buildSpec.changeScope,
      buildSpecContextPolicy: pkg.buildSpec.contextPolicy,
      buildSpecPreviewPolicy: pkg.buildSpec.previewPolicy,
      promptLength: pkg.userPrompt.length,
      dynamicContextBudgetTokens: pkg.dynamicContextPruning.budgetTokens,
      dynamicContextUsedTokens: pkg.dynamicContextPruning.usedTokens,
      dynamicContextDroppedBlocks: pkg.dynamicContextPruning.droppedBlockKeys,
      variantId: pkg.variantId ?? null,
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
    existingShellRoutePaths = [],
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
  const componentRefNames = [
    ...getRelevantExampleNames(capabilities),
    ...getPromptDrivenExampleNames(prompt),
  ];
  const uniqueRefNames = [...new Set(componentRefNames)];
  const localRefs = loadShadcnExamples(uniqueRefNames);
  const officialRefsPromise = fetchMissingRegistryExamples(uniqueRefNames, localRefs)
    .then((fetched) => [...localRefs, ...fetched])
    .catch(() => localRefs);
  const communityRefsPromise = fetchCommunityBlocks(capabilities, prompt).catch(() => []);
  let officialRefs: ComponentReference[] = localRefs;
  let communityRefs: ComponentReference[] = [];
  let resolvedReferenceFetches = false;

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
    const [autoSelection, fetchedOfficialRefs, fetchedCommunityRefs] = await Promise.all([
      matchScaffoldAuto(prompt, buildIntent, {
        useEmbeddings: embeddingScaffoldMatch,
        queryContext: scaffoldQueryContext,
        capabilities,
        generationMode: resolvedMode,
        brief,
      }),
      officialRefsPromise,
      communityRefsPromise,
    ]);
    officialRefs = fetchedOfficialRefs;
    communityRefs = fetchedCommunityRefs;
    resolvedReferenceFetches = true;
    resolvedScaffold = autoSelection.scaffold;
    scaffoldSelection = autoSelection.meta;

    if (scaffoldSelection.semanticUnavailableReason) {
      console.info("[scaffold] scaffold_semantic_unavailable", {
        reason: scaffoldSelection.semanticUnavailableReason,
        fallbackScaffoldId: resolvedScaffold?.id ?? null,
        method: scaffoldSelection.selectionMethod,
      });
    }

  }

  // ── Drift detection: Brief-LLM scaffold nomination vs final pick (Fas 1.0) ──
  // Brief returns a hint; the embedding/keyword pick above is the final answer.
  // Logging drift makes mismatches visible in dev and lets us tune confidence
  // thresholds. Brief stays the source of truth for design direction either way.
  // On followUp runs, the brief may carry stale nominations from init — we
  // include `mode` in the log so noise from followUp can be filtered out.
  const briefScaffoldNom = (brief as { scaffoldNomination?: { id?: string; confidence?: number } } | null | undefined)
    ?.scaffoldNomination ?? null;
  // Compare case-insensitively — Brief-LLM occasionally returns "SaaS-landing"
  // when the canonical id is "saas-landing"; that is not real drift.
  const briefNomNorm = briefScaffoldNom?.id?.trim().toLowerCase() ?? null;
  const finalNorm = resolvedScaffold?.id.toLowerCase() ?? null;
  if (briefNomNorm && finalNorm && briefNomNorm !== finalNorm) {
    console.info("[orchestrate] scaffold_drift", {
      mode: input.generationMode ?? "init",
      briefNominated: briefScaffoldNom!.id,
      briefConfidence: briefScaffoldNom!.confidence ?? null,
      finalPick: resolvedScaffold!.id,
      pickMethod: scaffoldSelection.selectionMethod ?? "unknown",
      pickConfidence: scaffoldSelection.selectionConfidence ?? null,
    });
  }

  if (!resolvedReferenceFetches) {
    [officialRefs, communityRefs] = await Promise.all([officialRefsPromise, communityRefsPromise]);
  }

  const intentPromoted =
    buildIntent === "website" &&
    scaffoldMode === "auto" &&
    isAppScaffold(resolvedScaffold?.id) &&
    scaffoldSelection.selectionConfidence !== "low";
  const effectiveBuildIntent: BuildIntent = intentPromoted ? "app" : buildIntent;

  if (intentPromoted) {
    console.info("[orchestrate] build_intent_promoted", {
      from: buildIntent,
      to: effectiveBuildIntent,
      scaffoldId: resolvedScaffold?.id,
      scaffoldConfidence: scaffoldSelection.selectionConfidence,
      reason: "Auto-selected app scaffold implies app intent for route planning and downstream context",
    });
  }

  const capabilityHints = buildCapabilityHints(capabilities);
  const componentReferences = [...officialRefs, ...communityRefs];

  const routePlan = buildRoutePlan({
    prompt: routePlanPrompt ?? prompt,
    buildIntent: effectiveBuildIntent,
    brief,
    resolvedScaffold,
    generationMode: resolvedMode,
    existingRoutePaths,
  });
  const preGenerationContracts = inferPreGenerationContracts({
    prompt: input.contractsPrompt ?? prompt,
    buildIntent: effectiveBuildIntent,
    brief,
    capabilities,
    contractAnswers,
  });
  const buildSpec = deriveBuildSpec({
    prompt: buildSpecPrompt ?? prompt,
    buildIntent: effectiveBuildIntent,
    generationMode: resolvedMode,
    resolvedScaffold,
    routePlan,
    preGenerationContracts,
    promptStrategyMeta,
    capabilities,
    isFirstCodeGeneration: input.isFirstCodeGeneration,
    existingShellRoutePaths,
    previewPolicyOverride:
      input.lifecycleStage === "integrations" ? "fidelity3" : undefined,
  });
  const orchestrationContract = buildOrchestrationContract({
    resolvedScaffold,
    routePlan,
    buildSpec,
  });
  let scaffoldContext: string | undefined;
  let resolvedSerializeMode: "inspirational" | "structural" | null = null;
  if (resolvedScaffold) {
    resolvedSerializeMode =
      resolvedMode === "followUp" || buildSpec.contextPolicy === "heavy"
        ? "structural"
        : "inspirational";
    const scaffoldBudgetChars =
      buildSpec.tokenBudgets.scaffoldChars ??
      estimateCharsForTokens(buildSpec.tokenBudgets.scaffoldTokens ?? 6_250);
    scaffoldContext = serializeScaffoldForPrompt(resolvedScaffold, resolvedSerializeMode, {
      maxChars: scaffoldBudgetChars,
      contextPolicy: buildSpec.contextPolicy,
      routePlan,
      capabilities,
    });
  }

  // Pool-modell: när dossier-pipen är på, plocka top dossiers via embedding +
  // recommendation-boost. Misslyckad selektion (saknad fil, API-error) → null,
  // system-prompt-block hoppas tyst över. Säker no-op om inga active dossiers.
  let dossierSelection: DossierSelectionResult | null = null;
  if (FEATURES.useDossierPipeline) {
    try {
      // Build a compact route-plan summary if a plan exists. Helps the
      // embedding query understand "user wants pricing page + login flow"
      // beyond what the bare prompt says (Fas 1.0 fix).
      const routePlanSummary = routePlan
        ? `routes: ${routePlan.routes
            .map((r) => `${r.path} (${r.intent})`)
            .slice(0, 8)
            .join(" | ")}`
        : undefined;

      dossierSelection = await selectDossiersForRequest({
        prompt: input.dossierPickPrompt ?? prompt,
        brief,
        scaffoldId: resolvedScaffold?.id ?? null,
        scaffoldContext: resolvedScaffold
          ? `Scaffold ${resolvedScaffold.label}. Tags: ${resolvedScaffold.tags.join(", ")}.`
          : undefined,
        capabilityHints: capabilityHints || undefined,
        routePlanSummary,
      });
      if (dossierSelection.selected.length > 0) {
        console.info("[orchestrate] dossiers_selected", {
          count: dossierSelection.selected.length,
          poolSize: dossierSelection.poolSize,
          embeddingsUsed: dossierSelection.embeddingsUsed,
          byCategory: dossierSelection.byCategory,
        });
      }
    } catch (err) {
      console.warn(
        "[orchestrate] dossier selection failed — continuing without dossiers:",
        err instanceof Error ? err.message : err,
      );
      dossierSelection = null;
    }
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
    serializeMode: resolvedSerializeMode,
    componentReferences,
    dossierSelection,
  };
}

async function resolveScaffoldVariant(
  scaffoldId: string | null | undefined,
  prompt: string,
  brief: Record<string, unknown> | null,
  generationMode: "init" | "followUp",
  sessionSeed?: string,
): Promise<ScaffoldVariant | null> {
  const styleKeywords = Array.isArray(
    (brief as { visualDirection?: { styleKeywords?: unknown } } | null)?.visualDirection?.styleKeywords,
  )
    ? (
        (
          brief as { visualDirection?: { styleKeywords?: unknown[] } } | null
        )?.visualDirection?.styleKeywords ?? []
      )
        .filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0)
    : [];
  const toneKeywords = Array.isArray((brief as { toneAndVoice?: unknown } | null)?.toneAndVoice)
    ? (
        (brief as { toneAndVoice?: unknown[] } | null)?.toneAndVoice ?? []
      ).filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0)
    : [];
  // Embedding-driven variant pick when an OpenAI key + variant-embeddings.json
  // are present. Falls back to keyword `pickScaffoldVariant` automatically.
  return pickScaffoldVariantAsync({
    prompt,
    scaffoldId: (scaffoldId as ScaffoldVariant["scaffoldId"] | null | undefined) ?? null,
    styleKeywords,
    toneKeywords,
    generationMode,
    sessionSeed,
  });
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
    buildIntent: _inputBuildIntent,
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

  const scaffoldIdForVariant = base.resolvedScaffold?.id ?? base.buildSpec.scaffoldId;
  const persistedVariant =
    input.persistedVariantId && scaffoldIdForVariant
      ? getVariantById(scaffoldIdForVariant, input.persistedVariantId)
      : null;
  const resolvedVariant =
    persistedVariant ??
    (await resolveScaffoldVariant(
      scaffoldIdForVariant,
      prompt,
      brief,
      resolvedMode,
      input.sessionSeed,
    ));

  // ── Drift detection: Brief variant nomination vs embedding pick (Fas 1.0) ──
  const briefVariantNom = (brief as { variantNomination?: { id?: string; confidence?: number } } | null | undefined)
    ?.variantNomination ?? null;
  const briefVarNomNorm = briefVariantNom?.id?.trim().toLowerCase() ?? null;
  const finalVarNorm = resolvedVariant?.id.toLowerCase() ?? null;
  if (briefVarNomNorm && finalVarNorm && briefVarNomNorm !== finalVarNorm) {
    console.info("[orchestrate] variant_drift", {
      mode: resolvedMode,
      scaffoldId: scaffoldIdForVariant,
      briefNominated: briefVariantNom!.id,
      briefConfidence: briefVariantNom!.confidence ?? null,
      finalPick: resolvedVariant!.id,
    });
  }

  // ── Dossier nomination vs final selection diff (Fas 1.0) ────────────────
  const briefDossierNoms = (brief as { dossierNominations?: Array<{ id?: string }> } | null | undefined)
    ?.dossierNominations ?? [];
  if (briefDossierNoms.length > 0 && base.dossierSelection) {
    const nominatedIds = new Set(briefDossierNoms.map((n) => n.id).filter(Boolean));
    const finalIds = new Set(base.dossierSelection.selected.map((s) => s.entry.id));
    const matched = [...nominatedIds].filter((id) => finalIds.has(id!));
    const briefOnly = [...nominatedIds].filter((id) => !finalIds.has(id!));
    const embeddingOnly = [...finalIds].filter((id) => !nominatedIds.has(id));
    console.info("[orchestrate] dossier_drift", {
      mode: resolvedMode,
      briefNominatedCount: nominatedIds.size,
      finalSelectedCount: finalIds.size,
      matched,
      briefOnly,
      embeddingOnly,
    });
  }

  const finalBuildIntent: BuildIntent = base.buildSpec.buildIntent;

  const dynamicOpts: DynamicContextOptions = {
    intent: finalBuildIntent,
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
    userPrompt: input.prompt,
    generationMode: resolvedMode,
    sessionSeed: input.sessionSeed,
    componentReferences: base.componentReferences,
    resolvedVariant,
    dossierSelection: base.dossierSelection,
  };

  const dynamic = buildDynamicContext(dynamicOpts);
  const engineSystemPrompt = composeEngineSystemPrompt(dynamic.context);

  return {
    engineSystemPrompt,
    dynamicContext: dynamic.context,
    dynamicContextPruning: dynamic.pruning,
    dynamicContextBlocks: dynamic.blocks,
    variantId: dynamic.variantId,
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
