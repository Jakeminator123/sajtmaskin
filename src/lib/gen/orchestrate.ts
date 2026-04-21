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
import { lockedVariantForFollowUp } from "./scaffold-variants/matcher";
import type { ScaffoldManifest } from "./scaffolds/types";
import {
  getScaffoldById,
  getScaffoldIds,
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
import {
  deriveBuildSpec,
  type BuildSpec,
  type BuildSpecQualityTarget,
} from "./build-spec";
import { estimateCharsForTokens } from "./tokens";
import { FEATURES } from "@/lib/config";
import { getRelevantExampleNames, getPromptDrivenExampleNames } from "./data/shadcn-example-map";
import { loadShadcnExamples, type ComponentReference } from "./data/shadcn-example-loader";
import { fetchMissingRegistryExamples } from "./data/shadcn-registry-fetch";
import { fetchCommunityBlocks } from "./data/community-registry-fetch";
import { selectDossiersForRequest, type DossierSelectionResult } from "./dossiers";
import { getModelContextWindowTokens } from "@/lib/models/context-window";
import type { RequestKindClass } from "./request-kind";

export interface OrchestrationInput {
  prompt: string;
  /** Optional prompt used specifically for route-planning inference (defaults to `prompt`). */
  routePlanPrompt?: string;
  /** Optional prompt used for BuildSpec classification (defaults to `prompt`). */
  buildSpecPrompt?: string;
  /**
   * Optional prompt used for pre-generation contract inference (defaults to `prompt`).
   * QW-1: stream callers should pass the *raw* user message here, not the
   * file-context-wrapped optimizedMessage — wrapped prompts contain previous
   * file content that drowns out the user's actual intent and biases contract
   * inference toward whatever libraries the previous files imported.
   */
  contractsPrompt?: string;
  /**
   * Optional prompt used for capability inference (defaults to `prompt`).
   * QW-1 follow-up: capability inference (`needsAuth`, `needsEcommerce`, …)
   * is keyword-based and triggers on terms like "login", "cart", "checkout"
   * found anywhere in the input string. When the wrapped follow-up prompt
   * carries previous file content (e.g. `LoginForm.tsx`), capabilities get
   * stuck on "auth" even when the user only asked to change a color.
   *
   * Stream callers should pass the *raw* user message so capability-driven
   * scaffold boosts, capabilityHints text, prompt-driven shadcn refs and
   * dossier pick query reflect actual intent — not stale file context.
   */
  capabilitiesPrompt?: string;
  /**
   * Optional prompt used for scaffold matching (embedding + keyword) and
   * `expandQuery`-based semantic search (defaults to `prompt`). P26: when
   * stream callers pass `optimizedMessage` (~30k chars with wrapped file
   * context) here, the embedding API rejects with `400 max 8192 tokens`
   * and the keyword fallback finds APP_KEYWORDS in the file dump — flipping
   * `landing-page` to `app-shell` on a follow-up that just asked to change
   * a color/image. Stream callers must pass the *raw* user message so the
   * matcher sees the actual intent, not the file context blob.
   */
  scaffoldMatchPrompt?: string;
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
  promptStrategyMeta?: Pick<
    PromptStrategyMeta,
    "strategy" | "promptType" | "complexityScore"
  > | null;
  /** Existing App Router paths from previous version files (follow-up route freeze/clamp). */
  existingRoutePaths?: string[];
  /** Route paths whose existing content is a deferred shell page (auto-detected from file content). */
  existingShellRoutePaths?: string[];
  /** Optional pre-inferred capabilities so callers can reuse the same deterministic pass. */
  capabilities?: InferredCapabilities;
  /** Per-session seed (e.g. chatId) to vary scaffold variant selection across sessions with identical prompts. */
  sessionSeed?: string;
  /**
   * Variant id to lock for this orchestration run. Used in two ways:
   *  - Initial chat (create-chat-stream-post): pinned to the keyword
   *    pre-match pick so brief-LLM hints and codegen agree.
   *  - Follow-ups (chat-message-stream-post): reused from the previous
   *    orchestration_snapshot.variantId to prevent variant drift across turns.
   * If the id no longer resolves via getVariantById, async picker runs as fallback.
   */
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
  /**
   * P22: optional chatId — propagated to inheritance helpers + variant lock
   * so per-chat decisions can be made deterministically. Stays optional so
   * existing callers compile unchanged.
   */
  chatId?: string | null;
  /**
   * P22: previously accepted version's `qualityTarget` (from
   * `orchestration_snapshot.buildSpec`). Lets follow-up runs reuse the
   * same target instead of re-running `quality_target_promoted_for_multipage`.
   */
  priorQualityTarget?: BuildSpecQualityTarget | null;
  /**
   * P22: previously persisted follow-up intent for this chat. Used by
   * the variant-lock helper — `clear-redesign` allows fresh matching,
   * everything else reuses the prior variant.
   */
  followUpIntent?:
    | "clear-refine"
    | "clear-redesign"
    | "ambiguous-redesign"
    | "ambiguous-followup"
    | "neutral";
  /**
   * Project locale forwarded to {@link buildRoutePlan} for locale-alternate
   * route dedupe. When omitted, we read `brief.locale` (forward-compatible
   * with future brief schema additions) and finally fall back to "sv" — the
   * value every Sajtmaskin scaffold currently emits via `<html lang="sv">`.
   * Pass an explicit value (e.g. "en") to keep the English route variants
   * (`/contact`, `/blog`, …) instead.
   */
  locale?: string;
  /**
   * Concrete own-engine model ID that will consume this generation
   * (e.g. `"gpt-5.4"`, `"claude-sonnet-4.6"`). When provided we look up
   * the model's input context window via `getModelContextWindowTokens()`
   * and pass it to `deriveBuildSpec()` so token budgets scale up to ~3×
   * for 1M-window models. Omit to use legacy 200k-baseline budgets.
   */
  engineModelId?: string | null;
  /**
   * P32: follow-up request taxonomy (regex). Telemetry only until later phases
   * branch the pipeline; does not change {@link deriveBuildSpec} yet.
   */
  requestKind?: RequestKindClass | null;
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

/**
 * P22: när vi kör en follow-up och en tidigare accepterad version finns
 * (med en `qualityTarget` i sin orchestration-snapshot) ska vi ärva det
 * värdet i stället för att räkna om från scratch. Det stoppar dubbel-
 * loggen `quality_target_promoted_for_multipage` på samma chat och säkrar
 * att senare turns inte plötsligt ändrar kvalitetstak.
 *
 * Faller tillbaka till `baseSpec` oförändrat när:
 *  - `generationMode !== "followUp"`
 *  - inget `priorQualityTarget` finns
 *  - värdet redan matchar baseSpec
 */
export function inheritQualityTargetFromPriorVersion(
  chatId: string | null | undefined,
  baseSpec: BuildSpec,
  priorQualityTarget?: BuildSpecQualityTarget | null,
): BuildSpec {
  if (baseSpec.generationMode !== "followUp") return baseSpec;
  if (!priorQualityTarget) return baseSpec;
  if (priorQualityTarget === baseSpec.qualityTarget) return baseSpec;
  console.info("[orchestrate] quality_target_inherited_from_prior_version", {
    chatId: chatId ?? null,
    from: baseSpec.qualityTarget,
    to: priorQualityTarget,
  });
  return { ...baseSpec, qualityTarget: priorQualityTarget };
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

  // QW-1: capability + prompt-driven shadcn-ref inference must run against
  // the raw user message, not the file-context-wrapped prompt. The wrapped
  // prompt carries previous file content on follow-ups and would otherwise
  // pin needsAuth/needsEcommerce to whatever the previous version imported.
  const intentSourcePrompt = input.capabilitiesPrompt ?? prompt;
  const capabilities = providedCapabilities ?? inferCapabilities(intentSourcePrompt);
  const resolvedMode = generationMode ?? (persistedScaffoldId ? "followUp" : "init");

  // P32 Fas A: requestKind is propagated for downstream phases. Logging is
  // owned by the call-site (devLog `request.kind.classified`) — orchestrate
  // intentionally does not double-log to console.

  const effectivePersistedScaffoldId =
    ignorePersistedScaffoldForMatch ? null : persistedScaffoldId;
  const scaffoldQueryContext = buildScaffoldQueryContext(brief);
  const componentRefNames = [
    ...getRelevantExampleNames(capabilities),
    ...getPromptDrivenExampleNames(intentSourcePrompt),
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
    // P26: scaffold matcher (embedding + keyword) must see the *raw* user
    // message, not the wrapped optimizedMessage. See `scaffoldMatchPrompt`
    // doc on `OrchestrationInput` for the full failure mode.
    const scaffoldMatcherPrompt = input.scaffoldMatchPrompt ?? prompt;
    const [autoSelection, fetchedOfficialRefs, fetchedCommunityRefs] = await Promise.all([
      matchScaffoldAuto(scaffoldMatcherPrompt, buildIntent, {
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

      // P26 (post-review note): tidigare hade vi här en fallback som
      // återgick till `persistedScaffoldId` när embedding föll. Reviewer
      // visade att den var död kod: vi når denna `auto`-gren bara när
      // `effectivePersistedScaffoldId` är falsy, dvs antingen finns inget
      // persisted-id eller `ignorePersistedScaffoldForMatch === true`. I
      // båda fallen kunde fallback-vilkoret aldrig sätts. Borttaget för
      // att undvika förvirring. Den ledande root-cause-fixen (A1: rå
      // message till embedding via `scaffoldMatchPrompt`) hindrar de
      // flesta embedding-fail i praktiken; om vi i framtiden vill täcka
      // unlock-fallet (clear-redesign + embedding-fail → fall tillbaka
      // ändå) ska det göras genom att lägga checken UTANFÖR auto-grenen,
      // efter scaffold-resolutionen, inte härinne.
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
    // Guard: brief-LLM occasionally hallucinates ids that aren't in the
    // registry (e.g. "saas", "blog-page", "shop"). Logging those as
    // scaffold_drift drowns out genuine drift signals where both sides
    // pick a real scaffold. Surface unknown nominations under their own
    // key so we can quantify schema-fidelity separately.
    const knownIds = new Set(getScaffoldIds().map((id) => id.toLowerCase()));
    if (!knownIds.has(briefNomNorm)) {
      console.info("[orchestrate] scaffold_unknown_brief_nomination", {
        mode: input.generationMode ?? "init",
        briefNominated: briefScaffoldNom!.id,
        briefConfidence: briefScaffoldNom!.confidence ?? null,
        finalPick: resolvedScaffold!.id,
      });
    } else {
      // The picker's `selectionMethod` reports HOW the picker arrived at
      // its choice (e.g. "agreement", "embeddings", "default") — not how
      // the picker's choice relates to the brief's nomination. When brief
      // and final pick differ, "agreement" is misleading. Compute a
      // brief-vs-picker outcome label from the brief's confidence so this
      // log clearly shows the relationship between the two stages.
      const briefConfidenceValue =
        typeof briefScaffoldNom!.confidence === "number"
          ? briefScaffoldNom!.confidence
          : null;
      const briefVsPickerOutcome =
        briefConfidenceValue !== null && briefConfidenceValue < 0.6
          ? "picker_default_low_brief_confidence"
          : "picker_override";
      console.info("[orchestrate] scaffold_drift", {
        mode: input.generationMode ?? "init",
        briefNominated: briefScaffoldNom!.id,
        briefConfidence: briefConfidenceValue,
        finalPick: resolvedScaffold!.id,
        pickMethod: briefVsPickerOutcome,
        pickerInternalMethod: scaffoldSelection.selectionMethod ?? "unknown",
        pickConfidence: scaffoldSelection.selectionConfidence ?? null,
      });
    }
  }

  if (!resolvedReferenceFetches) {
    [officialRefs, communityRefs] = await Promise.all([officialRefsPromise, communityRefsPromise]);
  }

  // P26: build_intent_promoted (website -> app) must not fire on follow-ups
  // when the user already has a persisted non-app scaffold. A bug-fix prompt
  // that happens to land on `app-shell` via keyword fallback would otherwise
  // permanently flip the entire project's intent, route plan and BuildSpec
  // policy. Init runs and explicit clear-redesign follow-ups still promote.
  const wouldPromote =
    buildIntent === "website" &&
    scaffoldMode === "auto" &&
    isAppScaffold(resolvedScaffold?.id) &&
    scaffoldSelection.selectionConfidence !== "low";
  const intentPromotionBlockedForFollowUp =
    wouldPromote &&
    resolvedMode === "followUp" &&
    !!persistedScaffoldId &&
    !ignorePersistedScaffoldForMatch &&
    !isAppScaffold(persistedScaffoldId);
  const intentPromoted = wouldPromote && !intentPromotionBlockedForFollowUp;
  const effectiveBuildIntent: BuildIntent = intentPromoted ? "app" : buildIntent;

  if (intentPromotionBlockedForFollowUp) {
    console.info("[orchestrate] intent_promotion_blocked_followup", {
      chatId: input.chatId ?? null,
      from: buildIntent,
      wouldHaveBeen: "app",
      scaffoldId: resolvedScaffold?.id,
      persistedScaffoldId,
      reason: "Follow-up runs do not flip project intent away from persisted non-app scaffold",
    });
  }

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

  // Locale resolution priority:
  //   1. Explicit `input.locale` (caller-overridable, e.g. CLI traces)
  //   2. `brief.locale` if the brief schema already carries one
  //   3. "sv" — every Sajtmaskin scaffold emits `<html lang="sv">`
  // Without this wiring, buildRoutePlan would silently fall back to its
  // own internal "sv" default and any future English brief would still
  // see `/blogg`/`/kontakt` survive the locale-alternate dedupe.
  const briefLocaleRaw = (brief as { locale?: unknown } | null | undefined)?.locale;
  const briefLocale =
    typeof briefLocaleRaw === "string" && briefLocaleRaw.trim().length > 0
      ? briefLocaleRaw.trim()
      : null;
  const resolvedLocale = input.locale ?? briefLocale ?? "sv";

  const routePlan = buildRoutePlan({
    prompt: routePlanPrompt ?? prompt,
    buildIntent: effectiveBuildIntent,
    brief,
    resolvedScaffold,
    generationMode: resolvedMode,
    existingRoutePaths,
    locale: resolvedLocale,
  });
  const preGenerationContracts = inferPreGenerationContracts({
    prompt: input.contractsPrompt ?? prompt,
    buildIntent: effectiveBuildIntent,
    brief,
    capabilities,
    contractAnswers,
  });
  const rawBuildSpec = deriveBuildSpec({
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
    // Q5a (2026-04-21): scale token budgets based on the resolved
    // model's input context window. Was implemented in build-spec but
    // never wired — 1M-window models silently used 200k-baseline budgets.
    modelContextWindowTokens: getModelContextWindowTokens(input.engineModelId),
  });
  const buildSpec = inheritQualityTargetFromPriorVersion(
    input.chatId,
    rawBuildSpec,
    input.priorQualityTarget,
  );
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

  // Deterministic dossier selection: brief.requestedCapabilities -> exact
  // dossier per capability. No embeddings, no fuzzy match, no caps. The
  // pipeline is gated by FEATURES.useDossierPipeline so it can be disabled
  // per environment if the dossier pool is unhealthy.
  let dossierSelection: DossierSelectionResult | null = null;
  if (FEATURES.useDossierPipeline) {
    try {
      // P26: bridge inferred capabilities to dossier capability ids so
      // dossiers trigger even when brief-LLM did not explicitly mark them.
      // Currently: needs3D -> "visual-3d" (covers Three Fiber dossier).
      // Adds capability to brief.requestedCapabilities; safe because
      // selectDossiersForRequest just looks up dossier ids by capability.
      const inferredCapabilityIds: string[] = [];
      if (capabilities.needs3D) inferredCapabilityIds.push("visual-3d");
      if (capabilities.needsParallax) {
        // Both parallax dossiers are independently useful — selectDossiersForRequest
        // picks one per capability, so listing both means we get the right one
        // when the prompt mentions just one direction (scroll vs pointer) and
        // both when the prompt is unspecific.
        inferredCapabilityIds.push("parallax-scroll", "parallax-pointer");
      }
      if (capabilities.needsPayments) inferredCapabilityIds.push("payments");
      const briefCapsRaw = (brief as { requestedCapabilities?: unknown } | null | undefined)
        ?.requestedCapabilities;
      const briefCapsArray = Array.isArray(briefCapsRaw)
        ? briefCapsRaw.filter((c): c is string => typeof c === "string")
        : [];
      const mergedCaps = Array.from(
        new Set([...briefCapsArray.map((c) => c.toLowerCase()), ...inferredCapabilityIds]),
      );
      dossierSelection = selectDossiersForRequest({
        brief,
        requestedCapabilities: mergedCaps,
      });
      if (dossierSelection.selected.length > 0) {
        console.info("[orchestrate] dossiers_selected", {
          count: dossierSelection.selected.length,
          poolSize: dossierSelection.poolSize,
          byCapability: dossierSelection.byCapability,
          inferredCapabilityBridge: inferredCapabilityIds,
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
  // P22: variant-lock på follow-ups. När caller lämnar `followUpIntent`
  // omarkerat tolkas det som "neutral" — då behåller vi nuvarande beteende
  // och låser till `persistedVariantId`. Om en framtida caller skickar in
  // `clear-redesign` släpper helpern loss matchern så att en ny stilriktning
  // kan väljas.
  const lockedVariant =
    resolvedMode === "followUp"
      ? lockedVariantForFollowUp({
          chatId: input.chatId,
          intent: input.followUpIntent ?? "neutral",
          scaffoldId: scaffoldIdForVariant,
          priorVariantId: input.persistedVariantId,
        })
      : null;
  const persistedVariant =
    lockedVariant ??
    (input.persistedVariantId && scaffoldIdForVariant
      ? getVariantById(scaffoldIdForVariant, input.persistedVariantId)
      : null);
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

  // ── Dossier capability vs final selection diff (v2 — capability-driven) ──
  // Logs which requested capabilities resolved to dossiers and which did not.
  // Useful for catching brief-LLM declaring capabilities that have no dossier.
  // Both sides are lowercased to match how `selectDossiersForRequest`
  // normalizes capabilities — otherwise a stray "Payments" in the brief would
  // produce a false "unresolved" warning.
  const briefCaps = (brief as { requestedCapabilities?: unknown } | null | undefined)?.requestedCapabilities;
  if (Array.isArray(briefCaps) && briefCaps.length > 0 && base.dossierSelection) {
    const requested = new Set(
      briefCaps
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean),
    );
    const resolved = new Set(Object.keys(base.dossierSelection.byCapability).map((c) => c.toLowerCase()));
    const unresolved = [...requested].filter((c) => !resolved.has(c));
    if (unresolved.length > 0) {
      console.info("[orchestrate] dossier_capability_unresolved", {
        mode: resolvedMode,
        requested: [...requested],
        resolved: [...resolved],
        unresolved,
      });
    }
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
    chatId: input.chatId ?? null,
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
