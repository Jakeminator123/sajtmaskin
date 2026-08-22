/**
 * `finalizeOrchestrationPrompts` — build the full system prompt from a
 * resolved orchestration base. Moved verbatim from
 * `src/lib/gen/orchestrate.ts` (structural split, no behavior change).
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import {
  normalizeDesignTheme,
  resolveThemePalette,
  THEME_CLUSTERS,
  type ThemeClusterId,
} from "@/lib/builder/theme-presets";
import {
  buildVariantTemplateReferenceAttachments,
  getVariantById,
  resolveVariantTemplateInspiration,
} from "../scaffold-variants";
import { SCAFFOLD_OFF_BASELINE_ID } from "../scaffolds/types";
import { resolveVariantForStyleChoice } from "../scaffold-variants/style-choice-variants";
import { resolveScaffoldVariant } from "./scaffold-variant-resolver";
import { lockedVariantForFollowUp } from "../scaffold-variants/matcher";
import {
  buildDynamicContext,
  composeEngineSystemPrompt,
  type DynamicContextOptions,
} from "../system-prompt";
import { filterRemovedCapabilitiesFromBriefSummary } from "../capability-removal";
import { variantTemplateImageInSentPayload } from "../request-metadata";
import { resolveVariantTemplateAddendum } from "../scaffold-variants/variant-template-addendum";
import type { FollowUpIntentMode } from "../follow-up-intent-types";
import { emitFollowUpFreezeDrift, enforceFollowUpVariantFreeze } from "./follow-up-freeze";
import { resolveGenerationMode } from "./generation-mode";
import { buildSourceReceipt } from "./source-receipt";
import type { FinalizedOrchestrationContext, OrchestrationBase, OrchestrationInput } from "./types";
import {
  detectFollowUpDesignAxes,
  detectFollowUpDesignFields,
  resolveDesignContract,
} from "./design-resolution";
import type { VariantSelection, VariantSelectionSource } from "../scaffold-variants";

/**
 * Style inspiration (still image + SHA-bound addendum excerpts) is resolved
 * on init and on `clear-redesign`. Regular follow-ups stay silent so their
 * prompt, attachments and source receipt stay byte-identical to the
 * init-only gate. Imported-repo mode and Scaffold: Av never resolve.
 */
export function shouldResolveVariantTemplateInspiration(input: {
  resolvedMode: "init" | "followUp";
  followUpIntent?: FollowUpIntentMode | null;
  importedRepoMode?: boolean;
  scaffoldId?: string | null;
}): boolean {
  const allowedMode = input.resolvedMode === "init" || input.followUpIntent === "clear-redesign";
  return (
    allowedMode && input.importedRepoMode !== true && input.scaffoldId !== SCAFFOLD_OFF_BASELINE_ID
  );
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
    brief: inputBrief = null,
    themeColors = null,
    imageGenerations = false,
    componentPalette = null,
    designThemePreset = null,
    designReferences = [],
    mediaCatalog,
    customInstructions,
  } = input;
  const brief =
    base.effectiveBrief ??
    filterRemovedCapabilitiesFromBriefSummary(
      inputBrief as Record<string, unknown> | null,
      base.removedCapabilities ?? [],
    );

  const resolvedMode = resolveGenerationMode(input);
  const approvedPlanAuthority = input.approvedPlanAuthority ?? null;

  const scaffoldIdForVariant = base.resolvedScaffold?.id ?? base.buildSpec.scaffoldId;
  // Final authority order: explicit style choice → follow-up lock → post-Brief
  // matcher → pre-Brief hint. A cheap init hint is deliberately NOT a persisted
  // lock: Deep Brief must get a chance to change the final variant.
  const variantLockReleased =
    resolvedMode === "followUp" &&
    (input.followUpIntent === "clear-redesign" || input.ignorePersistedScaffoldForMatch === true);
  const lockedVariant =
    resolvedMode === "followUp"
      ? lockedVariantForFollowUp({
          chatId: input.chatId,
          intent: input.followUpIntent ?? "neutral",
          scaffoldId: scaffoldIdForVariant,
          priorVariantId: input.persistedVariantId,
          scaffoldUnlocked: input.ignorePersistedScaffoldForMatch === true,
        })
      : null;
  const persistedVariant =
    lockedVariant ??
    (resolvedMode === "followUp" &&
    !variantLockReleased &&
    input.persistedVariantId &&
    scaffoldIdForVariant
      ? getVariantById(scaffoldIdForVariant, input.persistedVariantId)
      : null);
  // Byggval "Stil" → a pinned variant, resolved against the FINAL scaffold.
  //
  // Follow-ups are excluded — a frozen project keeps its style, and the pin has
  // already become the persisted variant by then.
  const styleChoiceVariant =
    resolvedMode === "init"
      ? resolveVariantForStyleChoice(scaffoldIdForVariant, input.styleChoiceHint)
      : null;
  const approvedPlanVariant =
    approvedPlanAuthority?.variantId && scaffoldIdForVariant
      ? getVariantById(scaffoldIdForVariant, approvedPlanAuthority.variantId)
      : null;
  if (approvedPlanAuthority?.variantId && !approvedPlanVariant) {
    throw new Error(
      `Approved plan variant ${approvedPlanAuthority.variantId} is no longer available for ${scaffoldIdForVariant ?? "no-scaffold"}.`,
    );
  }

  const matcherResult =
    approvedPlanAuthority || styleChoiceVariant || persistedVariant
      ? null
      : await resolveScaffoldVariant(
          scaffoldIdForVariant,
          prompt,
          brief,
          resolvedMode,
          input.sessionSeed,
          input.styleKeywordsHint,
          input.toneKeywordsHint,
          input.embeddingScaffoldMatch,
        );
  const hintVariant =
    input.variantHintId && scaffoldIdForVariant
      ? getVariantById(scaffoldIdForVariant, input.variantHintId)
      : null;
  const matcherHasSignal = matcherResult && matcherResult.source !== "hash-fallback";
  let resolvedVariant = approvedPlanAuthority
    ? approvedPlanVariant
    : (styleChoiceVariant ??
      persistedVariant ??
      (matcherHasSignal ? matcherResult.variant : null) ??
      hintVariant ??
      matcherResult?.variant ??
      null);
  let selectionSource: VariantSelectionSource = approvedPlanAuthority
    ? "approved-plan"
    : styleChoiceVariant
      ? "style-choice"
      : persistedVariant
        ? "follow-up-lock"
        : matcherHasSignal
          ? matcherResult.source === "embedding"
            ? matcherResult.usedBriefSignals
              ? "brief-embedding"
              : "embedding"
            : matcherResult.usedBriefSignals
              ? "brief-keyword"
              : "keyword"
          : hintVariant
            ? "hint-fallback"
            : "hash-fallback";
  const hashFallbackWon = !matcherHasSignal && !hintVariant && Boolean(matcherResult);
  let selectionScore = approvedPlanAuthority
    ? approvedPlanAuthority.variantSelection.score
    : matcherHasSignal || hashFallbackWon
      ? (matcherResult?.score ?? null)
      : null;
  let selectionRunnerUpScore = approvedPlanAuthority
    ? approvedPlanAuthority.variantSelection.runnerUpScore
    : matcherHasSignal || hashFallbackWon
      ? (matcherResult?.runnerUpScore ?? null)
      : null;
  let selectionMargin = approvedPlanAuthority
    ? approvedPlanAuthority.variantSelection.margin
    : matcherHasSignal || hashFallbackWon
      ? (matcherResult?.margin ?? null)
      : null;

  // ── 5-3 freeze-enforcement (variant) ──
  // Neutral follow-ups must keep the frozen contract variant. `lockedVariantForFollowUp`
  // already pins neutral runs; this clamps the residual case where the lock fell
  // through to a fresh pick. clear-redesign stays exempt. Behaviour-neutral when
  // there is no drift.
  // A server-bound approved plan is already the newer frozen authority. The
  // ordinary follow-up freeze protects the accepted base version, but must not
  // clamp a reviewed redesign back to that older variant when the technical
  // approval prompt itself classifies as neutral.
  const variantFreeze = approvedPlanAuthority
    ? null
    : enforceFollowUpVariantFreeze({
        resolvedMode,
        followUpIntent: input.followUpIntent,
        ignorePersistedScaffoldForMatch: input.ignorePersistedScaffoldForMatch === true,
        contractVariantId: input.followUpContract?.variantId ?? null,
        resolvedVariantId: resolvedVariant?.id ?? null,
      });
  if (variantFreeze?.clamped && variantFreeze.variantId) {
    const frozenVariant = getVariantById(scaffoldIdForVariant, variantFreeze.variantId);
    if (frozenVariant) {
      const driftedFromVariantId = resolvedVariant?.id ?? null;
      resolvedVariant = frozenVariant;
      selectionSource = "follow-up-lock";
      selectionScore = null;
      selectionRunnerUpScore = null;
      selectionMargin = null;
      emitFollowUpFreezeDrift("variant", {
        chatId: input.chatId ?? null,
        from: driftedFromVariantId,
        to: frozenVariant.id,
        scaffoldId: scaffoldIdForVariant,
      });
    }
  }

  const shouldResolveTemplate = approvedPlanAuthority
    ? approvedPlanAuthority.variantTemplateId !== null
    : shouldResolveVariantTemplateInspiration({
        resolvedMode,
        followUpIntent: input.followUpIntent,
        importedRepoMode: input.importedRepoMode,
        scaffoldId: scaffoldIdForVariant,
      });
  const variantTemplateInspiration = shouldResolveTemplate
    ? await resolveVariantTemplateInspiration(resolvedVariant, {
        selectionContext: { prompt, brief },
        preferredTemplateId: approvedPlanAuthority?.variantTemplateId ?? null,
      })
    : null;
  if (
    approvedPlanAuthority?.variantTemplateId &&
    variantTemplateInspiration?.templateId !== approvedPlanAuthority.variantTemplateId
  ) {
    throw new Error(
      `Approved plan template ${approvedPlanAuthority.variantTemplateId} is no longer available for variant ${approvedPlanAuthority.variantId ?? "none"}.`,
    );
  }
  const variantTemplateReferenceAttachments = buildVariantTemplateReferenceAttachments(
    variantTemplateInspiration,
  );

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
    const resolved = new Set(
      Object.keys(base.dossierSelection.byCapability).map((c) => c.toLowerCase()),
    );
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

  // Byggval "Färg" → the cluster's full surface palette, locked over the
  // variant's own `themeTokens`.
  //
  // INIT ONLY, and that restriction is load-bearing. Resolving the palette needs
  // the Färgläge choice, which only Byggval sends — but `designTheme` rides along
  // on every follow-up. A later round would therefore re-resolve the cluster
  // without knowing the mode. Guessing it from the pinned variant's `colorMode`
  // is not a fix: pick Färgläge=mörkt with a light variant (minimal → the light
  // `minimalist-mag`) and every follow-up would re-lock the LIGHT palette and
  // flip a dark site back mid-project.
  //
  // On a follow-up the palette is already baked into the project's own
  // `app/globals.css`, which the model receives as file context, so nothing is
  // lost by staying quiet. `themeColors` still locks primary/secondary/accent
  // through Visual Identity, and that lock is mode-agnostic — it cannot flip a
  // surface. Persisting the resolved mode in the orchestration snapshot would let
  // the block render on follow-ups too; that is a schema change, not a fix here.
  //
  // On init with Färgläge=Auto, inherit the resolved variant's light/dark mode
  // so a dark terminal variant does not get a forced light palette that then
  // claims to supersede the variant's own tokens.
  const normalizedDesignTheme = normalizeDesignTheme(designThemePreset);
  const lockedColorPalette =
    resolvedMode === "init"
      ? resolveThemePalette(normalizedDesignTheme, input.colorModeHint ?? "auto", {
          variantColorMode: resolvedVariant?.colorMode ?? null,
        })
      : null;
  const lockedColorPaletteLabel = lockedColorPalette
    ? (THEME_CLUSTERS[normalizedDesignTheme as ThemeClusterId]?.label ?? null)
    : null;
  const resolvedDesign = approvedPlanAuthority
    ? approvedPlanAuthority.resolvedDesign
    : resolveDesignContract({
        brief: brief as DynamicContextOptions["brief"],
        variant: resolvedVariant,
        priorResolvedDesign:
          resolvedMode === "followUp" && !variantLockReleased
            ? (input.followUpContract?.resolvedDesign ?? null)
            : null,
        currentRequestAxes:
          resolvedMode === "followUp" && !variantLockReleased
            ? detectFollowUpDesignAxes(input.rawPrompt ?? prompt)
            : [],
        currentRequestFields:
          resolvedMode === "followUp" && !variantLockReleased
            ? detectFollowUpDesignFields(input.rawPrompt ?? prompt)
            : [],
        themeOverride: themeColors,
        lockedColorPalette,
        colorModeHint: input.colorModeHint ?? null,
        styleKeywordsHint: input.styleKeywordsHint,
        toneKeywordsHint: input.toneKeywordsHint,
      });
  const variantSelection: VariantSelection = {
    source: selectionSource,
    score: selectionScore,
    runnerUpScore: selectionRunnerUpScore,
    margin: selectionMargin,
    hintId: approvedPlanAuthority
      ? approvedPlanAuthority.variantSelection.hintId
      : (input.variantHintId ?? null),
    finalId: resolvedVariant?.id ?? null,
    changedFromHint: approvedPlanAuthority
      ? approvedPlanAuthority.variantSelection.changedFromHint
      : Boolean(input.variantHintId && input.variantHintId !== (resolvedVariant?.id ?? null)),
  };
  console.info("[scaffold-variant] final_selection", variantSelection);

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
    lockedColorPalette,
    lockedColorPaletteLabel,
    designReferences,
    mediaCatalog,
    buildSpec: base.buildSpec,
    customInstructions,
    userPrompt: input.prompt,
    generationMode: resolvedMode,
    importedRepoMode: input.importedRepoMode === true,
    importedRepoContractContext: input.importedRepoContractContext,
    followUpIntent: input.followUpIntent,
    sessionSeed: input.sessionSeed,
    chatId: input.chatId ?? null,
    uiRecipes: base.uiRecipes,
    resolvedVariant,
    resolvedDesign,
    variantTemplateInspiration,
    dossierSelection: base.dossierSelection,
    mutedCapabilities: base.mutedCapabilities ?? null,
    previousFilePaths: input.previousFilePaths ?? null,
    dossierPromptContext: {
      generationMode: resolvedMode,
      requestedCapabilityTiers: base.requestedCapabilityTiers ?? null,
      previousFilePaths: input.previousFilePaths ?? null,
    },
    capabilityModifyHint: base.capabilityModifyHint,
  };

  const dynamic = buildDynamicContext(dynamicOpts);
  const engineSystemPrompt = composeEngineSystemPrompt(dynamic.context);
  const variantTemplateAddendumState = variantTemplateInspiration
    ? resolveVariantTemplateAddendum(variantTemplateInspiration.templateId).state
    : null;
  const sources = buildSourceReceipt({
    variantTemplateInspiration,
    variantTemplateAddendumState,
    variantTemplateImageSent: variantTemplateImageInSentPayload([
      ...variantTemplateReferenceAttachments,
      ...(input.requestAttachments ?? []),
    ]),
    uiRecipes: base.uiRecipes,
    dossierSelection: base.dossierSelection,
    mediaCatalog,
    designReferences,
    pruning: dynamic.pruning,
  });

  return {
    engineSystemPrompt,
    dynamicContext: dynamic.context,
    dynamicContextPruning: dynamic.pruning,
    dynamicContextBlocks: dynamic.blocks,
    variantId: dynamic.variantId,
    variantSelection,
    resolvedDesign,
    variantTemplateId: variantTemplateInspiration?.templateId ?? null,
    variantTemplateReferenceAttachments,
    sources,
  };
}
