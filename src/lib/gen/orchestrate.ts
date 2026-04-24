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
import { getVariantById } from "./scaffold-variants";
import { buildScaffoldQueryContext } from "./orchestrate/scaffold-query-context";
import { resolveScaffoldVariant } from "./orchestrate/scaffold-variant-resolver";
import { lockedVariantForFollowUp } from "./scaffold-variants/matcher";
import type { ScaffoldManifest } from "./scaffolds/types";
import {
  getScaffoldById,
  getScaffoldIds,
  matchScaffoldAuto,
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
import {
  type GenerationInputPackage,
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
import { deriveFollowUpStateFromInputs } from "./follow-up-predicate";
import type { RequestKindClass } from "./request-kind";
import type { FollowUpIntentMode } from "./follow-up-intent-types";
import type { CapabilitySpecificityTier } from "@/lib/builder/follow-up-capability-detection";
import {
  buildGenerationInputPackage,
  writeOrchestrationDynamicDump,
} from "./orchestrate/generation-package";
import {
  inheritQualityTargetFromPriorVersion,
  resolveBuildIntentPromotion,
} from "./orchestrate/policy-helpers";
export type {
  BuildIntentPromotionDecision,
  BuildIntentPromotionInput,
} from "./orchestrate/policy-helpers";
export {
  buildGenerationInputPackage,
  inheritQualityTargetFromPriorVersion,
  resolveBuildIntentPromotion,
  writeOrchestrationDynamicDump,
};

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
    "strategy" | "promptType"
  > &
    Partial<Pick<PromptStrategyMeta, "complexityScore">>;
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
   * everything else reuses the prior variant. Plan 06 added
   * `capability-add` for follow-ups that name a dossier capability.
   */
  followUpIntent?: FollowUpIntentMode;
  /**
   * Plan 06 (2026-04-24): explicit dossier capability ids the caller
   * detected on the follow-up text (via `detectFollowUpCapabilities`).
   * Merged into the brief-derived + inferred-capability bridge before
   * `selectDossiersForRequest` runs, so follow-ups that name a capability
   * (3D, contact-form, payments, …) actually inject a dossier even when
   * the snapshot-hydrated brief and the keyword-based `inferCapabilities`
   * pass both miss the signal.
   */
  requestedDossierCapabilities?: string[];
  /**
   * Plan 06: per-capability specificity tier (`generic` / `specific` /
   * `beyond-dossier`) computed by `detectFollowUpCapabilities`. Surfaced
   * back on `OrchestrationBase.requestedCapabilityTiers` so Plan 07 (3D
   * capability paths) knows whether to render the dossier verbatim, layer
   * custom code on top, or treat the dossier as a base for a fully custom
   * scene. Plan 06 itself does NOT mutate package.json, scaffold-files or
   * dossier-internals based on tier — that is plan 07 territory.
   */
  requestedCapabilityTiers?: Record<string, CapabilitySpecificityTier>;
  /**
   * Plan 11 / open-question #12: signal that the caller classified this
   * follow-up as `capability-modify` (the user named a dossier
   * capability AND referenced an existing on-page element such as
   * "pricken" / "den 3D-grejen"). When set, the dossier-shell branch is
   * suppressed and `buildDynamicContext` renders an explicit "modify
   * existing capability files" hint instead, so the LLM mutates the
   * working scene file rather than re-injecting a placeholder shell on
   * top of it.
   */
  capabilityModifyHint?: {
    capabilityIds: string[];
    references: string[];
  } | null;
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
  /**
   * OMTAG Fas 2·A / E2: number of previously-persisted files resolved for
   * this chat's follow-up base version. Optional so legacy callers compile
   * unchanged. When present, feeds {@link deriveFollowUpStateFromInputs}
   * alongside `persistedScaffoldId` to resolve `generationMode` consistently
   * with `finalize-merge.ts` (the P26 edge case
   * `persistedScaffoldId !== null && previousFilesCount === 0` used to split
   * the two call-sites).
   */
  previousFilesCount?: number;
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
  /**
   * Plan 06 (2026-04-24): per-capability specificity tier resolved for this
   * orchestration. Populated when the caller supplied
   * `requestedCapabilityTiers` (typically follow-ups going through
   * `detectFollowUpCapabilities`). Plan 07 reads this to decide whether to
   * generate a custom scene/file on top of a dossier shell.
   *
   * Captured at the `OrchestrationBase` level (not on `DossierSelectionResult`)
   * because plan 06's hard constraints exclude touching `src/lib/gen/dossiers/**`
   * — the tier metadata lives alongside the selection rather than inside it.
   */
  requestedCapabilityTiers?: Record<string, CapabilitySpecificityTier>;
  /**
   * Plan 11 / open-question #8: scaffold variant id carried along the
   * orchestration base so follow-ups have a deterministic place to read
   * the previous variant from without re-parsing
   * `orchestration_snapshot.variantId` at each callsite.
   *
   * Populated from `OrchestrationInput.persistedVariantId` when present,
   * else `null` (fresh init or a follow-up whose snapshot lost the id —
   * `lockedVariantForFollowUp` will fall back to the scaffold default
   * in that case).
   *
   * The final variant actually used by the codegen LLM is
   * `FinalizedOrchestrationContext.variantId`; this field exposes the
   * *prior* (locked) candidate before the matcher gets a chance to
   * release it. Keeping both lets us trace `prior → locked → final`
   * variant transitions in telemetry without requiring a new column on
   * `engine_versions` (the user's stop rule for Bug 2).
   */
  scaffoldVariantId: string | null;
  /**
   * Plan 11 / open-question #12: forwarded from
   * {@link OrchestrationInput.capabilityModifyHint} so downstream
   * `buildDynamicContext` / `renderCapabilityModifyHintBlock` can emit
   * the "modify existing scene file" instruction without needing a
   * second source of truth.
   */
  capabilityModifyHint: {
    capabilityIds: string[];
    references: string[];
  } | null;
}

export interface FinalizedOrchestrationContext {
  engineSystemPrompt: string;
  dynamicContext: string;
  dynamicContextPruning: DynamicContextPruning;
  dynamicContextBlocks: DynamicContextBlockTrace[];
  variantId: string | null;
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
  // OMTAG Fas 2·A / E2: a single predicate decides follow-up semantics.
  // When the caller passes an explicit `generationMode` (stream-post does),
  // respect it. Otherwise, fall back to the unified predicate using
  // `previousFilesCount` if known — or `persistedScaffoldId` as a best-effort
  // signal for legacy callers that omit both. This keeps orchestrate and
  // finalize-merge in agreement on the P26 edge case (scaffold pinned, no
  // files yet) instead of disagreeing via separate truthy-checks.
  const { isOrchestrationFollowUp } = deriveFollowUpStateFromInputs({
    persistedScaffoldId,
    previousFilesCount:
      input.previousFilesCount ?? (persistedScaffoldId ? 1 : 0),
  });
  const resolvedMode: "init" | "followUp" =
    generationMode ?? (isOrchestrationFollowUp ? "followUp" : "init");

  // P32 Fas A: `requestKind` carried on `OrchestrationInput` for *future*
  // branching in `deriveBuildSpec()`. Today it is logged at the call-site
  // (devLog `request.kind.classified`) and does **not** alter the pipeline —
  // see `docs/plans/active/P32-request-type-taxonomy.md` (Fas B is the step
  // that wires it into BuildSpec). Multiple audit-rounds have flagged the
  // apparent disconnect; keep the field + this explicit note until Fas B
  // lands so the intent of the dead-looking signal is documented in code.

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
  // Use intentSourcePrompt (same clean source that drives capability/scaffold
  // signals) instead of the wrapped `prompt` — otherwise file-context-wrapping
  // in optimizedMessage would poison `detectSectionTypes` and make us fetch
  // community blocks based on historical file contents instead of the user's
  // actual intent for this turn.
  const communityRefsPromise = fetchCommunityBlocks(capabilities, intentSourcePrompt).catch(() => []);
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
        mode: resolvedMode,
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
        mode: resolvedMode,
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

  // P26 (OMTAG Fas 2·A guard): `build_intent_promoted` (website -> app) must
  // not fire on follow-ups when the user already has a persisted non-app
  // scaffold. A bug-fix prompt that happens to land on `app-shell` via
  // keyword fallback would otherwise permanently flip the entire project's
  // intent, route plan and BuildSpec policy. Pure helper below so the
  // decision is unit-testable in isolation.
  const intentPromotionDecision = resolveBuildIntentPromotion({
    buildIntent,
    scaffoldMode,
    resolvedScaffoldId: resolvedScaffold?.id ?? null,
    selectionConfidence: scaffoldSelection.selectionConfidence ?? null,
    resolvedMode,
    persistedScaffoldId,
    ignorePersistedScaffoldForMatch,
  });
  const intentPromotionBlockedForFollowUp =
    intentPromotionDecision.blockedForFollowUp;
  const intentPromoted = intentPromotionDecision.promoted;
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
      // Plan 06 (2026-04-24): caller-provided ids from
      // `detectFollowUpCapabilities` cover the 13 dossier capabilities the
      // P26 inferred-capability bridge does not (contact-form, carousel,
      // testimonials-section, …). Order: brief → inferred → caller, with
      // dedup so the same capability doesn't double up downstream.
      const callerProvidedCapabilityIds = (input.requestedDossierCapabilities ?? [])
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.trim().toLowerCase());
      const mergedCaps = Array.from(
        new Set([
          ...briefCapsArray.map((c) => c.toLowerCase()),
          ...inferredCapabilityIds,
          ...callerProvidedCapabilityIds,
        ]),
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
          callerProvidedCapabilities: callerProvidedCapabilityIds,
          requestedCapabilityTiers: input.requestedCapabilityTiers ?? null,
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
    requestedCapabilityTiers: input.requestedCapabilityTiers,
    scaffoldVariantId: input.persistedVariantId ?? null,
    capabilityModifyHint: input.capabilityModifyHint ?? null,
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
    capabilityModifyHint: base.capabilityModifyHint,
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
