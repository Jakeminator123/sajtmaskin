/**
 * `finalizeOrchestrationPrompts` — build the full system prompt from a
 * resolved orchestration base. Moved verbatim from
 * `src/lib/gen/orchestrate.ts` (structural split, no behavior change).
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import { getVariantById } from "../scaffold-variants";
import { resolveScaffoldVariant } from "./scaffold-variant-resolver";
import { lockedVariantForFollowUp } from "../scaffold-variants/matcher";
import {
  buildDynamicContext,
  composeEngineSystemPrompt,
  type DynamicContextOptions,
} from "../system-prompt";
import { filterRemovedCapabilitiesFromBriefSummary } from "../capability-removal";
import { emitFollowUpFreezeDrift, enforceFollowUpVariantFreeze } from "./follow-up-freeze";
import { resolveGenerationMode } from "./generation-mode";
import type {
  FinalizedOrchestrationContext,
  OrchestrationBase,
  OrchestrationInput,
} from "./types";

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
    brief: inputBrief = null,
    themeColors = null,
    imageGenerations = false,
    componentPalette = null,
    designThemePreset = null,
    designReferences = [],
    customInstructions,
  } = input;
  const brief =
    base.effectiveBrief ??
    filterRemovedCapabilitiesFromBriefSummary(
      inputBrief as Record<string, unknown> | null,
      base.removedCapabilities ?? [],
    );

  const resolvedMode = resolveGenerationMode(input);

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

  // ── Dossier capability vs final selection diff (v2 — capability-driven) ──
  // Logs which REQUESTED capabilities resolved to dossiers and which did not.
  // Uses the RUNTIME requested list (`base.dossierRequestedCapabilities` =
  // brief ∪ inferred-bridge ∪ caller-provided ∪ follow-up floor, after F2/F3
  // filtering) rather than only `brief.requestedCapabilities`, so a capability
  // that arrived via the inferred bridge or a follow-up detector but has no
  // dossier is surfaced too. Both sides are lowercased to match how
  // `selectDossiersForRequest` normalizes capabilities — otherwise a stray
  // "Payments" would produce a false "unresolved" warning.
  const runtimeRequestedCaps = base.dossierRequestedCapabilities ?? [];
  if (runtimeRequestedCaps.length > 0 && base.dossierSelection) {
    const requested = new Set(
      runtimeRequestedCaps
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
    tier3BuildSpec: input.tier3BuildSpec,
    tier3ApprovedProviders: input.dossierProviderHints,
    componentPalette,
    designThemePreset,
    designReferences,
    buildSpec: base.buildSpec,
    customInstructions,
    userPrompt: input.prompt,
    generationMode: resolvedMode,
    importedRepoMode: input.importedRepoMode === true,
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
