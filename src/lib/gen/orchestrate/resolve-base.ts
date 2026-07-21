/**
 * `resolveOrchestrationBase` — scaffold, route plan, contracts, BuildSpec and
 * dossier selection without building the full system prompt. Moved verbatim
 * from `src/lib/gen/orchestrate.ts` (structural split, no behavior change).
 */
import { detectCapabilityRemoval } from "@/lib/builder/follow-up-capability-removal";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { buildScaffoldQueryContext } from "./scaffold-query-context";
import type { ScaffoldManifest } from "../scaffolds/types";
import {
  getScaffoldById,
  matchScaffoldAuto,
  type ScaffoldSelectionMeta,
} from "../scaffolds";
import {
  serializeScaffoldForPrompt,
} from "../scaffolds/serialize";
import {
  inferCapabilities,
  buildCapabilityHints,
} from "../capability-inference";
import {
  buildCapabilityRemovalHint,
  filterRemovedCapabilitiesFromBriefSummary,
  filterRemovedCapabilitiesFromContracts,
  filterProvidersForRemovedCapabilities,
  suppressRemovedInferredCapabilities,
} from "../capability-removal";
import { resolveDossierCapabilitiesFromInferredCapabilities } from "../capability-dossier-bridge";
import { buildRoutePlan, collectExplicitRouteRemovals, normalizeRoutePath } from "../route-plan";
import type { PlannedRoute } from "../route-plan";
import { inferPreGenerationContracts } from "../contract/pre-generation-contracts";
import { buildOrchestrationContract } from "../orchestration-contract";
import { deriveBuildSpec } from "../build-spec";
import { estimateCharsForTokens } from "../tokens";
import { FEATURES } from "@/lib/config";
import {
  resolveShadcnUiRecipes,
  type ShadcnUiRecipe,
} from "../data/shadcn-ui-recipes";
import {
  resolveCapabilitiesPresentInVersion,
  resolveDossiersPresentInVersion,
  selectDossiersForRequest,
  type DossierSelectionResult,
} from "../dossiers";
import { getModelContextWindowTokens } from "@/lib/models/context-window";
import { deriveFollowUpStateFromInputs } from "../follow-up-predicate";
import {
  inheritQualityTargetFromPriorVersion,
  resolveBuildIntentPromotion,
} from "./policy-helpers";
import { filterDossierCapabilitiesForPrompt } from "./capability-prompt-filter";
import {
  detectFollowUpRouteDrift,
  emitFollowUpFreezeDrift,
  enforceFollowUpCapabilityFloor,
  enforceFollowUpRouteFreeze,
  enforceFollowUpScaffoldFreeze,
  scopeF3DossierCapabilities,
} from "./follow-up-freeze";
import type { OrchestrationBase, OrchestrationInput } from "./types";

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
    brief: inputBrief = null,
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
  const inferredCapabilities =
    providedCapabilities ?? inferCapabilities(intentSourcePrompt);
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
  const capabilityRemovalPrompt =
    input.rawPrompt ?? input.capabilitiesPrompt ?? input.prompt ?? "";
  const capabilityRemoval =
    resolvedMode === "followUp"
      ? detectCapabilityRemoval(capabilityRemovalPrompt)
      : { removedCapabilities: [], readdedCapabilities: [], matchedKeywords: [] };
  const removedCapabilities = capabilityRemoval.removedCapabilities;
  const readdedCapabilities = capabilityRemoval.readdedCapabilities;
  const capabilities = suppressRemovedInferredCapabilities(
    inferredCapabilities,
    removedCapabilities,
  );
  const brief = filterRemovedCapabilitiesFromBriefSummary(
    inputBrief as Record<string, unknown> | null,
    removedCapabilities,
  );
  const removedDossiers = resolveDossiersPresentInVersion(
    (input.previousFilePaths ?? []).map((path) => ({ path })),
    input.configuredEnvKeys,
  )
    .map((selected) => selected.entry)
    .filter((entry) =>
      removedCapabilities.includes(entry.capability.toLowerCase()),
    );
  const removedDossierIds = removedDossiers.map((entry) => entry.id);
  const isF3ApprovalRound =
    input.lifecycleStage === "integrations" &&
    (input.dossierProviderHints?.length ?? 0) > 0;
  const f3ApprovedCapabilities = Array.from(
    new Set([
      ...(input.followUpContract?.f3ApprovedCapabilities ?? []),
      ...(isF3ApprovalRound ? input.requestedDossierCapabilities ?? [] : []),
    ]),
  ).filter(
    (capability) =>
      !removedCapabilities.includes(capability.trim().toLowerCase()),
  );
  const f3ApprovedProviders = filterProvidersForRemovedCapabilities(
    Array.from(
      new Set([
        ...(input.followUpContract?.f3ApprovedProviders ?? []),
        ...(isF3ApprovalRound ? input.dossierProviderHints ?? [] : []),
      ]),
    ),
    removedCapabilities,
  );
  const capabilityRemovalHint = buildCapabilityRemovalHint(
    removedCapabilities,
    removedDossiers,
  );
  if (removedCapabilities.length > 0) {
    console.info("[orchestrate] followup_capability_removal", {
      chatId: input.chatId ?? null,
      removedCapabilities,
      removedDossierIds,
      matchedKeywords: capabilityRemoval.matchedKeywords,
    });
  }

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

  // Gate integration-heavy capability hints (payments/database) on the
  // lifecycle stage so F2 (design) stays mock-first and never instructs real
  // env keys / API routes — those belong to F3. `lifecycleStage` is the same
  // signal that drives `previewPolicy: "fidelity3"` below (F3 is opt-in via
  // the "Bygg integrationer" override only). See `.cursor/rules/env-flow-f2-mute.mdc`.
  const capabilityHints = [
    buildCapabilityHints(capabilities, {
      lifecycleStage:
        input.lifecycleStage === "integrations" ? "integrations" : "design",
    }),
    capabilityRemovalHint,
  ]
    .filter((hint): hint is string => Boolean(hint))
    .join("\n\n");

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

  const retainedContractCapabilities = Array.from(
    new Set([
      ...(input.followUpContract?.capabilities ?? []),
      ...(input.requestedDossierCapabilities ?? []),
      ...resolveDossierCapabilitiesFromInferredCapabilities(capabilities),
    ]),
  ).filter(
    (capability) =>
      !removedCapabilities.includes(capability.trim().toLowerCase()),
  );
  const preGenerationContracts = filterRemovedCapabilitiesFromContracts(
    inferPreGenerationContracts({
      prompt: input.contractsPrompt ?? prompt,
      buildIntent: effectiveBuildIntent,
      brief,
      capabilities,
      contractAnswers,
    }),
    removedCapabilities,
    retainedContractCapabilities,
  );
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
      // 5-5 capabilities can-only-grow: restore the FollowUpContract floor so a
      // base-version capability (e.g. an init contact-form) can never be
      // silently filtered away just because this follow-up message doesn't
      // mention it. Floor, not ceiling — new caps still flow; init is a no-op.
      const capabilityFloor = enforceFollowUpCapabilityFloor({
        resolvedMode,
        resolvedCapabilities: mergedCaps,
        contractCapabilities: input.followUpContract?.capabilities ?? [],
        // F2-mute: keep F3-only integrations parked (don't restore them into
        // the F2 dossier selection); they return when the project is in F3.
        previewPolicy: buildSpec.previewPolicy,
        removedCapabilities,
      });
      if (capabilityFloor.floorApplied) {
        emitFollowUpFreezeDrift("capabilities", {
          chatId: input.chatId ?? null,
          floorApplied: true,
          restoredCapabilities: capabilityFloor.restoredCapabilities,
        });
      }
      dossierRequestedCapabilities = capabilityFloor.capabilities;

      // F3 capability scope (Task 2 — capability-inflation fix). In the
      // integrations stage the F2 mute is lifted, so `filterDossierCapabilities
      // ForPrompt` + the can-only-grow floor restore EVERY capability the Deep
      // Brief ever nominated speculatively (analytics, auth, payments, …) —
      // turning a one-capability ask into an 8-dossier / ~40-env-key wall (prod
      // 2026-07-09). An F3 build should only wire integrations that are actually
      // wanted NOW: (a) capabilities the CURRENT message infers, (b) providers
      // the user explicitly APPROVED, and (c) integrations with real FILE
      // EVIDENCE in the parent/base version (already built — safe to keep). The
      // allowed set is dependency-expanded so a kept `subscriptions` still pulls
      // its required `supabase-auth`. Speculative brief/floor capabilities with
      // no evidence, ask, or approval are dropped. F2/design rounds are
      // untouched (can-only-grow stays). See docs/architecture/llm-pipeline.md.
      if (input.lifecycleStage === "integrations") {
        const explicitCapabilities = [
          ...inferredCapabilityIds,
          ...callerProvidedCapabilityIds,
          // Durable approvals (review round 2, fix 5): capabilities the user
          // explicitly approved in an EARLIER F3 round, persisted on the
          // snapshot. Without these, approve → build-incomplete (no file
          // evidence yet) → the next round's scope drops the capability again.
          ...f3ApprovedCapabilities,
        ];
        const fileEvidenceCapabilities = resolveCapabilitiesPresentInVersion(
          input.previousFilePaths ?? [],
        );
        const f3Scope = scopeF3DossierCapabilities({
          capabilities: dossierRequestedCapabilities,
          explicitCapabilities,
          fileEvidenceCapabilities,
        });
        if (f3Scope.dropped.length > 0) {
          console.info("[orchestrate] f3_capability_scope_dropped", {
            chatId: input.chatId ?? null,
            dropped: f3Scope.dropped,
            kept: f3Scope.capabilities,
            explicitCapabilities,
            fileEvidenceCapabilities,
          });
          dossierRequestedCapabilities = f3Scope.capabilities;
        }
      }
      // Same prompt surface as the F2 filter above, PLUS the approved-provider
      // hints from an F3 approval round: the raw approval text ("Godkänn")
      // has no provider keyword, so without the hints an approved MongoDB
      // build would silently receive the postgres-drizzle default under
      // `database` (Codex P1 on PR #445).
      const providerHintText = (input.dossierProviderHints ?? [])
        .filter((hint): hint is string => typeof hint === "string" && hint.trim().length > 0)
        .join(" ");
      const dossierSelectionPromptText = [
        input.rawPrompt ?? input.capabilitiesPrompt ?? input.prompt,
        providerHintText,
      ]
        .filter((part) => typeof part === "string" && part.trim().length > 0)
        .join("\n");
      dossierSelection = selectDossiersForRequest({
        brief,
        // `dossierRequestedCapabilities` is the canonical "exact ids passed into
        // selection" set: `capabilityFloor.capabilities`, then scoped down in F3
        // to (current-message ∪ approved ∪ file-evidence) so the build stops
        // restoring speculative brief/floor capabilities (Task 2). Identical to
        // the floor set on F2/design rounds.
        requestedCapabilities: dossierRequestedCapabilities,
        // F3 (review round 2): the scoped list is authoritative even when
        // EMPTY — select.ts's brief fallback would otherwise resurrect the
        // speculative brief set in exactly the inflation case the scope
        // filters (scoped [] + brief with 5 caps → 5 dossiers again).
        disableBriefFallback:
          input.lifecycleStage === "integrations" ||
          removedCapabilities.length > 0,
        // Lets sibling dossiers under one capability resolve on explicit
        // provider intent via manifest relevanceKeywords (e.g. "MongoDB" →
        // mongodb-atlas instead of the postgres-drizzle default).
        promptText: dossierSelectionPromptText,
        // Project-scoped `configured` signal (fix-isconfigured): use the
        // project's stored env keys, not the platform process.env.
        configuredEnvKeys: input.configuredEnvKeys,
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
    effectiveBrief: brief as Record<string, unknown> | null,
    buildSpec,
    serializeMode: resolvedSerializeMode,
    uiRecipes,
    dossierRequestedCapabilities,
    removedCapabilities,
    readdedCapabilities,
    removedDossierIds,
    f3ApprovedCapabilities,
    f3ApprovedProviders,
    dossierSelection,
    requestedCapabilityTiers: input.requestedCapabilityTiers,
    scaffoldVariantId: input.persistedVariantId ?? null,
    capabilityModifyHint: input.capabilityModifyHint ?? null,
  };
}
