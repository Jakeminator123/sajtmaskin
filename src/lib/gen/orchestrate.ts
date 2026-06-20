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
import { resolveDossierCapabilitiesFromInferredCapabilities } from "./capability-dossier-bridge";
import { buildRoutePlan, collectExplicitRouteRemovals, normalizeRoutePath } from "./route-plan";
import type { PlannedRoute, RoutePlan } from "./route-plan";
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
import {
  resolveShadcnUiRecipes,
  type ShadcnUiRecipe,
} from "./data/shadcn-ui-recipes";
import { selectDossiersForRequest, type DossierSelectionResult } from "./dossiers";
import { getModelContextWindowTokens } from "@/lib/models/context-window";
import { deriveFollowUpStateFromInputs } from "./follow-up-predicate";
import type { FollowUpContract } from "./orchestration-snapshot";
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
  /**
   * User's original message before any wrapping/optimization. Used downstream
   * by `inferScaffoldRetrySuggestion` to avoid P26-poisoning where wrapped
   * prompts confuse scaffold-suggestion regex.
   */
  rawPrompt?: string;
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
  /**
   * All file paths present in the previous version (follow-up / auto-repair).
   * Used by the dossier renderer to suppress redundant verbatim blocks for
   * files that already exist in `## Current Project Files`. Optional — an
   * empty/undefined value falls back to the legacy "always emit verbatim"
   * behavior, so init callers that don't carry this signal stay unaffected.
   */
  previousFilePaths?: string[];
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
   * Conservative init fast lane for simple F2 website/template prompts.
   * When true, orchestration skips optional external/component-reference
   * enrichment and dossier selection, but keeps scaffold selection, route
   * plan, BuildSpec, system prompt, autofix/finalize/preflight unchanged.
   */
  simpleWebsitePath?: boolean;
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
  /**
   * Område 5 / 5-1: consolidated inherited/frozen follow-up signals
   * ({@link FollowUpContract}). 5-3 makes orchestrate read this as the *active*
   * source to enforce the scaffold/variant/route freeze on neutral follow-ups
   * (clamp on drift; clear-redesign exempt). Later activities (5-4..5-7) extend
   * the validation to other surfaces.
   */
  followUpContract?: FollowUpContract;
}

function explicitlyRequestsContactDelivery(prompt: string): boolean {
  return /\b(resend|smtp|webhook|server action|backend|api route|send(?:a)? email|email delivery|mail delivery|skicka mejl|skicka mail|skicka e-?post|mejlutskick|mailutskick)\b/i.test(prompt);
}

function explicitlyRequestsCarousel(prompt: string): boolean {
  return /\b(carousel|slider|slideshow|swipe|embla|karusell|bildkarusell|bildspel|hero[-\s]?slider|produktkarusell)\b/i.test(prompt);
}

const F3_ONLY_DOSSIER_CAPABILITIES = new Set([
  "ai-chat",
  "analytics",
  "auth",
  "error-tracking",
  "payments",
]);

export function filterDossierCapabilitiesForPrompt(params: {
  capabilities: string[];
  prompt: string;
  previewPolicy: BuildSpec["previewPolicy"];
}): string[] {
  return params.capabilities.filter((capability) => {
    if (
      params.previewPolicy !== "fidelity3" &&
      F3_ONLY_DOSSIER_CAPABILITIES.has(capability)
    ) {
      return false;
    }
    if (
      capability === "contact-form" &&
      params.previewPolicy !== "fidelity3" &&
      !explicitlyRequestsContactDelivery(params.prompt)
    ) {
      return false;
    }
    if (capability === "carousel" && !explicitlyRequestsCarousel(params.prompt)) {
      return false;
    }
    return true;
  });
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
  uiRecipes: ShadcnUiRecipe[];
  /**
   * Exact capability ids passed into `selectDossiersForRequest` after brief +
   * inferred + caller merge and F2/F3 filtering. Used by finalize/autofix
   * legacy fallbacks; selected dossiers are a subset of this list.
   */
  dossierRequestedCapabilities: string[];
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

// ── Område 5 / 5-3: follow-up freeze-enforcement ──────────────────────────
// `FollowUpContract` is the *active* source of the frozen scaffold / variant /
// route a neutral follow-up must not drift away from. These pure helpers
// decide, from already-resolved values, whether orchestrate drifted from the
// contract — so the integration points stay tiny and the decisions are
// unit-testable in isolation (mirrors `resolveBuildIntentPromotion`).
// clear-redesign is the exemption: a genuine redesign is allowed to rematch.

/** Surfaces guarded by 5-3 freeze-enforcement (used by the drift telemetry). */
export type FollowUpFreezeSurface = "scaffold" | "variant" | "route";

export interface FollowUpScaffoldFreezeInput {
  resolvedMode: "init" | "followUp";
  /** clear-redesign scaffold-unlock signal (auto-mode rematch) — exempts the clamp. */
  ignorePersistedScaffoldForMatch: boolean;
  /** Frozen scaffold id from the active contract (null → nothing to freeze to). */
  contractScaffoldId: string | null;
  /** Scaffold id orchestrate resolved before enforcement. */
  resolvedScaffoldId: string | null;
}

export interface FollowUpScaffoldFreezeDecision {
  /** Scaffold id to use after enforcement: the frozen id when clamped, else the resolved id. */
  scaffoldId: string | null;
  /** True when the resolved scaffold drifted from the contract and was clamped. */
  clamped: boolean;
}

/**
 * Decide whether a follow-up's resolved scaffold drifted from the frozen
 * contract scaffold. Returns `clamped: true` + the frozen id when a neutral
 * follow-up resolved a *different* scaffold — e.g. a client-sent
 * `scaffoldMode:"manual"` swap (the orchestrate manual-bypass). No-op on init,
 * on clear-redesign (lock released), when the contract carries no scaffold, or
 * when there is no drift. Pure and behaviour-neutral when nothing drifted.
 */
export function enforceFollowUpScaffoldFreeze(
  input: FollowUpScaffoldFreezeInput,
): FollowUpScaffoldFreezeDecision {
  const { resolvedMode, ignorePersistedScaffoldForMatch, contractScaffoldId, resolvedScaffoldId } =
    input;
  if (
    resolvedMode !== "followUp" ||
    ignorePersistedScaffoldForMatch ||
    !contractScaffoldId ||
    !resolvedScaffoldId ||
    resolvedScaffoldId === contractScaffoldId
  ) {
    return { scaffoldId: resolvedScaffoldId, clamped: false };
  }
  return { scaffoldId: contractScaffoldId, clamped: true };
}

export interface FollowUpVariantFreezeInput {
  resolvedMode: "init" | "followUp";
  /** clear-redesign releases the variant lock (matcher picks a fresh look). */
  followUpIntent: FollowUpIntentMode | null | undefined;
  contractVariantId: string | null;
  resolvedVariantId: string | null;
}

export interface FollowUpVariantFreezeDecision {
  variantId: string | null;
  clamped: boolean;
}

/**
 * Decide whether a follow-up's resolved variant drifted from the frozen
 * contract variant. `lockedVariantForFollowUp` already pins neutral follow-ups
 * to the prior variant; this is the assertion/clamp safety net for the residual
 * case where the lock fell through to a fresh pick. clear-redesign is exempt.
 */
export function enforceFollowUpVariantFreeze(
  input: FollowUpVariantFreezeInput,
): FollowUpVariantFreezeDecision {
  const { resolvedMode, followUpIntent, contractVariantId, resolvedVariantId } = input;
  if (
    resolvedMode !== "followUp" ||
    followUpIntent === "clear-redesign" ||
    !contractVariantId ||
    !resolvedVariantId ||
    resolvedVariantId === contractVariantId
  ) {
    return { variantId: resolvedVariantId, clamped: false };
  }
  return { variantId: contractVariantId, clamped: true };
}

export interface FollowUpRouteFreezeInput {
  resolvedMode: "init" | "followUp";
  /** clear-redesign may rebuild the route plan; skip the drift check. */
  ignorePersistedScaffoldForMatch: boolean;
  /** Frozen base routes from the contract (`routePlan.existingRoutePaths`). */
  contractExistingRoutePaths: string[];
  /**
   * Frozen deferred-shell route paths from the contract
   * (`routePlan.existingShellRoutePaths`). Validated alongside
   * `contractExistingRoutePaths` so dropping a frozen shell route also drifts.
   * Optional / defaults to `[]` so the no-shell case stays unchanged.
   */
  contractShellRoutePaths?: string[];
  /** Route paths orchestrate's `buildRoutePlan` produced. */
  resolvedRoutePaths: string[];
}

export interface FollowUpRouteFreezeDecision {
  /** Frozen contract routes (existing + shell) missing from the resolved plan. */
  droppedPaths: string[];
  /** Subset of `droppedPaths` that were frozen deferred-shell routes. */
  droppedShellPaths: string[];
  drifted: boolean;
}

/**
 * Detect whether any frozen contract route was dropped from a neutral
 * follow-up's resolved route plan. Covers the FULL frozen `routePlan` — both
 * `existingRoutePaths` and `existingShellRoutePaths` — so dropping a frozen
 * deferred-shell route also fires the drift signal (closes a false-green gap
 * where only the non-shell array was validated).
 *
 * Drift telemetry (5-3): reports every frozen route missing from the resolved
 * plan, regardless of whether the drop was intentional. 5-6 adds the actual
 * restore on top of this via {@link enforceFollowUpRouteFreeze}, which splits
 * the dropped set into silently-dropped (restored) vs explicitly-removed (left
 * gone, via the canonical `collectExplicitRouteRemovals` signal). This detector
 * stays the "what changed" signal; the clamp is the "what we corrected" step.
 * clear-redesign is exempt. Both sides are normalized so trailing-slash forms
 * never false-fire.
 */
export function detectFollowUpRouteDrift(
  input: FollowUpRouteFreezeInput,
): FollowUpRouteFreezeDecision {
  const {
    resolvedMode,
    ignorePersistedScaffoldForMatch,
    contractExistingRoutePaths,
    contractShellRoutePaths = [],
    resolvedRoutePaths,
  } = input;
  if (
    resolvedMode !== "followUp" ||
    ignorePersistedScaffoldForMatch ||
    (contractExistingRoutePaths.length === 0 && contractShellRoutePaths.length === 0)
  ) {
    return { droppedPaths: [], droppedShellPaths: [], drifted: false };
  }
  const resolved = new Set(resolvedRoutePaths.map((path) => normalizeRoutePath(path)));
  const frozenShell = Array.from(
    new Set(contractShellRoutePaths.map((path) => normalizeRoutePath(path))),
  );
  const frozenAll = Array.from(
    new Set(
      [...contractExistingRoutePaths, ...contractShellRoutePaths].map((path) =>
        normalizeRoutePath(path),
      ),
    ),
  );
  const droppedShellPaths = frozenShell.filter((path) => !resolved.has(path));
  const droppedPaths = frozenAll.filter((path) => !resolved.has(path));
  return { droppedPaths, droppedShellPaths, drifted: droppedPaths.length > 0 };
}

// ── Område 5 / 5-6: route HARD-CLAMP + explicit route-removal ──────────────
// #168 (5-3) left route as a drift SIGNAL only (`detectFollowUpRouteDrift`):
// it logged a dropped frozen route but never restored it, so a neutral
// follow-up could still SILENTLY drop a page. 5-6 closes that: the contract's
// frozen routes become a *floor* that a neutral follow-up must keep, with two
// exemptions — (a) clear-redesign (`ignorePersistedScaffoldForMatch`), and
// (b) EXPLICIT route-removal. Route-removal intent is NOT a new signal: it is
// the canonical `collectExplicitRouteRemovals` (owned by
// `route-plan/planning-helpers.ts`, the very signal `buildRoutePlan` already
// uses to honor intentional removals). The clamp restores only *silently*
// dropped frozen routes; explicitly removed ones stay gone. Drift telemetry is
// retained — drift is now both clamped AND logged.

export interface FollowUpRouteClampInput {
  resolvedMode: "init" | "followUp";
  /** clear-redesign may rebuild the route plan; exempts the clamp. */
  ignorePersistedScaffoldForMatch: boolean;
  /** Frozen base routes from the contract (`routePlan.existingRoutePaths`). */
  contractExistingRoutePaths: string[];
  /**
   * Frozen deferred-shell route paths from the contract
   * (`routePlan.existingShellRoutePaths`). Restored alongside
   * `contractExistingRoutePaths` so a silently dropped frozen shell route is
   * also clamped back. Optional / defaults to `[]` for the no-shell case.
   */
  contractShellRoutePaths?: string[];
  /** Route paths orchestrate's `buildRoutePlan` produced. */
  resolvedRoutePaths: string[];
  /**
   * Paths the user explicitly asked to remove — the CANONICAL route-removal
   * signal (`collectExplicitRouteRemovals`, owned by
   * `route-plan/planning-helpers.ts`). A frozen route in this set is treated as
   * an intentional removal and is NOT restored. Optional / defaults to `[]` so
   * a follow-up with no removal intent restores every dropped frozen route.
   */
  explicitRouteRemovals?: string[];
}

export interface FollowUpRouteClampDecision {
  /** Frozen routes silently dropped (not explicitly removed) → restored by the clamp. */
  restoredPaths: string[];
  /** Subset of `restoredPaths` that were frozen deferred-shell routes. */
  restoredShellPaths: string[];
  /** Frozen routes the user explicitly removed → intentionally left dropped (not restored). */
  allowedRemovalPaths: string[];
  /** True when the clamp restored at least one silently-dropped frozen route. */
  clamped: boolean;
}

/**
 * Human-readable name for a route restored by the clamp. Mirrors the inline
 * `routeNameFromPath` in `route-plan-builder.ts` so a restored route reads the
 * same as one `buildRoutePlan` would have preserved itself.
 */
function routeNameForRestoredPath(path: string, buildIntent: BuildIntent): string {
  if (path === "/") return buildIntent === "app" ? "Dashboard" : "Home";
  const label = path
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/[-_]/g, " "))
    .join(" ")
    .trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Route";
}

/**
 * Decide which frozen contract routes a neutral follow-up dropped must be
 * restored. Mirrors `enforceFollowUpScaffoldFreeze`/`enforceFollowUpVariantFreeze`:
 * pure, decides from already-resolved values, behaviour-neutral when nothing
 * drifted. Covers the FULL frozen `routePlan` (existing + deferred-shell). The
 * frozen set is a FLOOR, not a ceiling — additive routes the follow-up added
 * are never touched, only missing frozen routes are considered for restore.
 *
 * Two exemptions keep intentional change working:
 *  - clear-redesign (`ignorePersistedScaffoldForMatch`) → no clamp at all.
 *  - EXPLICIT route-removal (`explicitRouteRemovals`, the canonical
 *    `collectExplicitRouteRemovals` signal) → that route stays dropped.
 *
 * No-op on init, on clear-redesign, when the contract carries no frozen routes,
 * or when every frozen route survived. Both sides are normalized so
 * trailing-slash forms never false-fire.
 */
export function enforceFollowUpRouteFreeze(
  input: FollowUpRouteClampInput,
): FollowUpRouteClampDecision {
  const {
    resolvedMode,
    ignorePersistedScaffoldForMatch,
    contractExistingRoutePaths,
    contractShellRoutePaths = [],
    resolvedRoutePaths,
    explicitRouteRemovals = [],
  } = input;
  const empty: FollowUpRouteClampDecision = {
    restoredPaths: [],
    restoredShellPaths: [],
    allowedRemovalPaths: [],
    clamped: false,
  };
  if (
    resolvedMode !== "followUp" ||
    ignorePersistedScaffoldForMatch ||
    (contractExistingRoutePaths.length === 0 && contractShellRoutePaths.length === 0)
  ) {
    return empty;
  }
  const resolved = new Set(resolvedRoutePaths.map((path) => normalizeRoutePath(path)));
  const removed = new Set(explicitRouteRemovals.map((path) => normalizeRoutePath(path)));
  const shellSet = new Set(contractShellRoutePaths.map((path) => normalizeRoutePath(path)));
  const frozenAll = Array.from(
    new Set(
      [...contractExistingRoutePaths, ...contractShellRoutePaths].map((path) =>
        normalizeRoutePath(path),
      ),
    ),
  );
  const restoredPaths: string[] = [];
  const allowedRemovalPaths: string[] = [];
  for (const path of frozenAll) {
    if (resolved.has(path)) continue; // frozen route survived → nothing to do
    if (removed.has(path)) {
      allowedRemovalPaths.push(path); // intentional removal → leave it dropped
      continue;
    }
    restoredPaths.push(path); // silently dropped → restore
  }
  const restoredShellPaths = restoredPaths.filter((path) => shellSet.has(path));
  return {
    restoredPaths,
    restoredShellPaths,
    allowedRemovalPaths,
    clamped: restoredPaths.length > 0,
  };
}

/**
 * Best-effort drift telemetry for 5-3 freeze-enforcement. Mirrors the existing
 * `[orchestrate] scaffold_drift` / `variant_drift` console signals and is
 * wrapped so telemetry can NEVER throw and break generation.
 */
function emitFollowUpFreezeDrift(
  surface: FollowUpFreezeSurface,
  detail: Record<string, unknown>,
): void {
  try {
    console.info("[orchestrate] followup_freeze_drift", { surface, ...detail });
  } catch {
    // ignore — drift telemetry is best-effort and must not break gen
  }
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
    simpleWebsitePath = false,
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
  const uiRecipesPromise = simpleWebsitePath
    ? Promise.resolve<ShadcnUiRecipe[]>([])
    : resolveShadcnUiRecipes({
        capabilities,
        prompt: intentSourcePrompt,
        maxRecipes: 3,
      }).catch(() => []);
  let uiRecipes: ShadcnUiRecipe[] = [];
  let resolvedUiRecipes = false;

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
    const [autoSelection, fetchedUiRecipes] = await Promise.all([
      matchScaffoldAuto(scaffoldMatcherPrompt, buildIntent, {
        useEmbeddings: embeddingScaffoldMatch,
        queryContext: scaffoldQueryContext,
        capabilities,
      }),
      uiRecipesPromise,
    ]);
    uiRecipes = fetchedUiRecipes;
    resolvedUiRecipes = true;
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

  // ── 5-3 freeze-enforcement (scaffold) ──
  // Close the orchestrate manual-bypass: a neutral follow-up that sent
  // `scaffoldMode:"manual"` + a different scaffoldId must not swap away from
  // the frozen contract scaffold. clear-redesign (ignorePersistedScaffoldForMatch)
  // stays exempt. Behaviour-neutral when there is no drift.
  const scaffoldFreeze = enforceFollowUpScaffoldFreeze({
    resolvedMode,
    ignorePersistedScaffoldForMatch,
    contractScaffoldId: input.followUpContract?.scaffoldId ?? null,
    resolvedScaffoldId: resolvedScaffold?.id ?? null,
  });
  if (scaffoldFreeze.clamped && scaffoldFreeze.scaffoldId) {
    const frozenScaffold = getScaffoldById(scaffoldFreeze.scaffoldId);
    if (frozenScaffold) {
      const driftedFromScaffoldId = resolvedScaffold?.id ?? null;
      resolvedScaffold = frozenScaffold;
      scaffoldSelection = {
        ...scaffoldSelection,
        selectedScaffold: frozenScaffold.id,
        selectionMethod: "persisted",
        selectionConfidence: "high",
        topCandidates: [{ id: frozenScaffold.id, score: 1, source: "keyword" }],
      };
      emitFollowUpFreezeDrift("scaffold", {
        chatId: input.chatId ?? null,
        from: driftedFromScaffoldId,
        to: frozenScaffold.id,
        requestedScaffoldMode: scaffoldMode,
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

  if (!resolvedUiRecipes) {
    uiRecipes = await uiRecipesPromise;
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

  // ── 5-6 freeze-enforcement (route) — HARD CLAMP + explicit route-removal ──
  // #168 (5-3) detected route drift but never restored it (signal-only). 5-6
  // closes that: a neutral follow-up's resolved plan must keep the contract's
  // frozen routes (existing + deferred-shell) — they are a *floor*. Any frozen
  // route SILENTLY dropped is restored; two exemptions keep intentional change
  // working: clear-redesign (`ignorePersistedScaffoldForMatch`) and EXPLICIT
  // route-removal (the canonical `collectExplicitRouteRemovals` signal — the
  // same one `buildRoutePlan` honors). Defensive: the whole clamp is wrapped so
  // a clamp/telemetry failure can NEVER throw and break generation. Drift
  // telemetry stays — drift is now both clamped AND logged.
  const contractExistingRoutePaths =
    input.followUpContract?.routePlan.existingRoutePaths ?? [];
  const contractShellRoutePaths =
    input.followUpContract?.routePlan.existingShellRoutePaths ?? [];
  const routeDrift = detectFollowUpRouteDrift({
    resolvedMode,
    ignorePersistedScaffoldForMatch,
    contractExistingRoutePaths,
    contractShellRoutePaths,
    resolvedRoutePaths: routePlan.routes.map((route) => route.path),
  });
  if (routeDrift.drifted) {
    emitFollowUpFreezeDrift("route", {
      chatId: input.chatId ?? null,
      droppedPaths: routeDrift.droppedPaths,
      droppedShellPaths: routeDrift.droppedShellPaths,
    });
  }
  try {
    if (
      resolvedMode === "followUp" &&
      !ignorePersistedScaffoldForMatch &&
      (contractExistingRoutePaths.length > 0 || contractShellRoutePaths.length > 0)
    ) {
      const frozenAllPaths = Array.from(
        new Set(
          [...contractExistingRoutePaths, ...contractShellRoutePaths].map((path) =>
            normalizeRoutePath(path),
          ),
        ),
      );
      // Canonical route-removal signal (owner: route-plan/planning-helpers).
      // Use the same route-planning prompt + intent buildRoutePlan used so the
      // clamp and the planner agree on what counts as an intentional removal.
      const explicitRouteRemovals = Array.from(
        collectExplicitRouteRemovals(
          routePlanPrompt ?? prompt,
          effectiveBuildIntent,
          frozenAllPaths,
        ),
      );
      const routeClamp = enforceFollowUpRouteFreeze({
        resolvedMode,
        ignorePersistedScaffoldForMatch,
        contractExistingRoutePaths,
        contractShellRoutePaths,
        resolvedRoutePaths: routePlan.routes.map((route) => route.path),
        explicitRouteRemovals,
      });
      if (routeClamp.clamped) {
        const existingPlanPaths = new Set(
          routePlan.routes.map((route) => normalizeRoutePath(route.path)),
        );
        for (const restorePath of routeClamp.restoredPaths) {
          if (existingPlanPaths.has(restorePath)) continue;
          const isRoot = restorePath === "/";
          const restoredRoute: PlannedRoute = {
            path: restorePath,
            name: routeNameForRestoredPath(restorePath, effectiveBuildIntent),
            intent: isRoot
              ? "Keep the root route as the primary entry point while applying follow-up changes."
              : `Preserve the existing ${restorePath} route — frozen by the follow-up contract; the user did not ask to remove it.`,
            required: isRoot,
          };
          routePlan.routes.push(restoredRoute);
          existingPlanPaths.add(restorePath);
        }
        emitFollowUpFreezeDrift("route", {
          chatId: input.chatId ?? null,
          clamped: true,
          restoredPaths: routeClamp.restoredPaths,
          restoredShellPaths: routeClamp.restoredShellPaths,
          allowedRemovalPaths: routeClamp.allowedRemovalPaths,
        });
      }
    }
  } catch (err) {
    // Defensive: a route-clamp/telemetry failure must NEVER break generation.
    console.warn(
      "[orchestrate] followup route-clamp failed — continuing without clamp:",
      err instanceof Error ? err.message : err,
    );
  }

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
    brief,
    isFirstCodeGeneration: input.isFirstCodeGeneration,
    existingShellRoutePaths,
    scaffoldUnlockedForMatch: ignorePersistedScaffoldForMatch,
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
    const promptScaffoldBudgetChars =
      resolvedSerializeMode === "inspirational"
        ? Math.min(scaffoldBudgetChars, 10_000)
        : scaffoldBudgetChars;
    scaffoldContext = serializeScaffoldForPrompt(resolvedScaffold, resolvedSerializeMode, {
      maxChars: promptScaffoldBudgetChars,
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
  let dossierRequestedCapabilities: string[] = [];
  if (FEATURES.useDossierPipeline && !simpleWebsitePath) {
    try {
      const inferredCapabilityIds =
        resolveDossierCapabilitiesFromInferredCapabilities(capabilities);
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
      const mergedCapsRaw = Array.from(
        new Set([
          ...briefCapsArray.map((c) => c.toLowerCase()),
          ...inferredCapabilityIds,
          ...callerProvidedCapabilityIds,
        ]),
      );
      const mergedCaps = filterDossierCapabilitiesForPrompt({
        capabilities: mergedCapsRaw,
        prompt: input.rawPrompt ?? input.capabilitiesPrompt ?? input.prompt,
        previewPolicy: buildSpec.previewPolicy,
      });
      dossierRequestedCapabilities = mergedCaps;
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
          filteredCapabilities: mergedCapsRaw.filter((cap) => !mergedCaps.includes(cap)),
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
    uiRecipes,
    dossierRequestedCapabilities,
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
  let resolvedVariant =
    persistedVariant ??
    (await resolveScaffoldVariant(
      scaffoldIdForVariant,
      prompt,
      brief,
      resolvedMode,
      input.sessionSeed,
    ));

  // ── 5-3 freeze-enforcement (variant) ──
  // Neutral follow-ups must keep the frozen contract variant. `lockedVariantForFollowUp`
  // already pins neutral runs; this clamps the residual case where the lock fell
  // through to a fresh pick. clear-redesign stays exempt. Behaviour-neutral when
  // there is no drift.
  const variantFreeze = enforceFollowUpVariantFreeze({
    resolvedMode,
    followUpIntent: input.followUpIntent,
    contractVariantId: input.followUpContract?.variantId ?? null,
    resolvedVariantId: resolvedVariant?.id ?? null,
  });
  if (variantFreeze.clamped && variantFreeze.variantId) {
    const frozenVariant = getVariantById(scaffoldIdForVariant, variantFreeze.variantId);
    if (frozenVariant) {
      const driftedFromVariantId = resolvedVariant?.id ?? null;
      resolvedVariant = frozenVariant;
      emitFollowUpFreezeDrift("variant", {
        chatId: input.chatId ?? null,
        from: driftedFromVariantId,
        to: frozenVariant.id,
        scaffoldId: scaffoldIdForVariant,
      });
    }
  }

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
    followUpIntent: input.followUpIntent,
    sessionSeed: input.sessionSeed,
    chatId: input.chatId ?? null,
    uiRecipes: base.uiRecipes,
    resolvedVariant,
    dossierSelection: base.dossierSelection,
    dossierPromptContext: {
      generationMode: resolvedMode,
      requestedCapabilityTiers: base.requestedCapabilityTiers ?? null,
      previousFilePaths: input.previousFilePaths ?? null,
    },
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
