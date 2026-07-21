/**
 * Public orchestration types — moved verbatim from `src/lib/gen/orchestrate.ts`
 * (structural split, no behavior change).
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";
import type { PaletteState } from "@/lib/builder/palette";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import type { CapabilitySpecificityTier } from "@/lib/builder/follow-up-capability-detection";
import type { Tier3BuildSpec } from "@/lib/integrations/tier3-build-spec";
import type { ScaffoldManifest } from "../scaffolds/types";
import type { ScaffoldSelectionMeta } from "../scaffolds";
import type {
  DesignReferenceAsset,
  DynamicContextBlockTrace,
  DynamicContextPruning,
} from "../system-prompt";
import type { InferredCapabilities } from "../capability-inference";
import type { RoutePlan } from "../route-plan";
import type {
  ConfirmedContractAnswer,
  PreGenerationContractContext,
} from "../contract/pre-generation-contracts";
import type { OrchestrationContract } from "../orchestration-contract";
import type { BuildSpec, BuildSpecQualityTarget } from "../build-spec";
import type { ShadcnUiRecipe } from "../data/shadcn-ui-recipes";
import type { DossierSelectionResult } from "../dossiers";
import type { FollowUpContract } from "../orchestration-snapshot";
import type { RequestKindClass } from "../request-kind";
import type { FollowUpIntentMode } from "../follow-up-intent-types";

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
  /** File-derived parent-version build plan used by the F3 system prompt. */
  tier3BuildSpec?: Tier3BuildSpec | null;
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
   * Provider identity hints from an APPROVED F3 integration proposal
   * (e.g. `["mongodb"]`, from the consumed continuation marker). The raw
   * approval reply ("Godkänn"/"bygg integrationer") carries no provider
   * keyword, so sibling selection under a shared capability (`database` →
   * postgres-drizzle | mongodb-atlas | neon-postgres) would otherwise fall
   * back to the capability default and silently swap the approved provider
   * (Codex P1 on PR #445). Appended to the dossier-selection promptText
   * surface only — never used for capability detection/filtering.
   */
  dossierProviderHints?: string[];
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
   * (e.g. `"gpt-5.4"`, `"claude-opus-4.8"`). When provided we look up
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
  /**
   * Env keys the CURRENT PROJECT has stored a real value for (resolved by the
   * stream caller from `getStoredProjectEnvVarMap`). Threaded into
   * `selectDossiersForRequest` so the hard-dossier `configured` prompt signal
   * reflects the project's env instead of the platform `process.env`. Omit
   * (legacy) → deprecated `process.env` fallback. Prompt-only; no gate impact.
   */
  configuredEnvKeys?: ReadonlySet<string>;
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
  /** Deep Brief with explicitly removed capabilities subtracted. */
  effectiveBrief?: Record<string, unknown> | null;
  buildSpec: BuildSpec;
  serializeMode: "inspirational" | "structural" | null;
  uiRecipes: ShadcnUiRecipe[];
  /**
   * Exact capability ids passed into `selectDossiersForRequest` after brief +
   * inferred + caller merge and F2/F3 filtering. Used by finalize/autofix
   * legacy fallbacks; selected dossiers are a subset of this list.
   */
  dossierRequestedCapabilities: string[];
  /** Explicit integration capabilities removed by this follow-up. */
  removedCapabilities?: string[];
  /**
   * Explicit integration capabilities re-activated by this follow-up ("lägg
   * tillbaka Stripe"). Threaded to the persisted snapshot so it — and only it —
   * clears a durable removal tombstone; the derived floor never does.
   */
  readdedCapabilities?: string[];
  /** File-evidenced dossier ids whose owned files must be deleted at merge. */
  removedDossierIds?: string[];
  /** Durable F3 approvals after explicit-removal subtraction. */
  f3ApprovedCapabilities?: string[];
  /** Durable F3 provider approvals after explicit-removal subtraction. */
  f3ApprovedProviders?: string[];
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
