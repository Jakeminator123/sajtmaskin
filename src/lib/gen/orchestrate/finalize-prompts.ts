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
import { resolveVariantForStyleChoice } from "../scaffold-variants/style-choice-variants";
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
  // Samma unlock-signal som scaffold-sidan: `clear-redesign` ELLER
  // `ignorePersistedScaffoldForMatch` (supplement-mönstren, t.ex.
  // "gör om hela sajten").
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
  // Utan `!variantLockReleased` band den här fallbacken omedelbart tillbaka den
  // gamla varianten som låset just släppte — en redesign fick alltså rematchad
  // scaffold men identisk stil. Fallbacken finns kvar för init-vägen (variant
  // redan vald och persistad före första codegen).
  const persistedVariant =
    lockedVariant ??
    (!variantLockReleased && input.persistedVariantId && scaffoldIdForVariant
      ? getVariantById(scaffoldIdForVariant, input.persistedVariantId)
      : null);
  // Byggval "Stil" → a pinned variant, resolved against the FINAL scaffold.
  //
  // Deliberately ahead of `persistedVariant` on init: create-chat pre-matches a
  // variant from a keyword-only scaffold guess and passes it as
  // `persistedVariantId`, so leaving the pin behind it would let that guess beat
  // the user's explicit choice. Follow-ups are excluded — a frozen project keeps
  // its style, and the pin has already become the persisted variant by then.
  const styleChoiceVariant =
    resolvedMode === "init"
      ? resolveVariantForStyleChoice(scaffoldIdForVariant, input.styleChoiceHint)
      : null;

  let resolvedVariant =
    styleChoiceVariant ??
    persistedVariant ??
    (await resolveScaffoldVariant(
      scaffoldIdForVariant,
      prompt,
      brief,
      resolvedMode,
      input.sessionSeed,
      // Byggval (init controls): structured style keywords participate in
      // the fresh pick. No-op on follow-ups (persisted/locked variant wins).
      input.styleKeywordsHint,
      input.toneKeywordsHint,
    ));

  // ── 5-3 freeze-enforcement (variant) ──
  // Neutral follow-ups must keep the frozen contract variant. `lockedVariantForFollowUp`
  // already pins neutral runs; this clamps the residual case where the lock fell
  // through to a fresh pick. clear-redesign stays exempt. Behaviour-neutral when
  // there is no drift.
  const variantFreeze = enforceFollowUpVariantFreeze({
    resolvedMode,
    followUpIntent: input.followUpIntent,
    ignorePersistedScaffoldForMatch: input.ignorePersistedScaffoldForMatch === true,
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

  const variantTemplateInspiration =
    resolvedMode === "init" && input.importedRepoMode !== true
      ? await resolveVariantTemplateInspiration(resolvedVariant)
      : null;
  const variantTemplateReferenceAttachments =
    buildVariantTemplateReferenceAttachments(variantTemplateInspiration);

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

  return {
    engineSystemPrompt,
    dynamicContext: dynamic.context,
    dynamicContextPruning: dynamic.pruning,
    dynamicContextBlocks: dynamic.blocks,
    variantId: dynamic.variantId,
    variantTemplateId: variantTemplateInspiration?.templateId ?? null,
    variantTemplateReferenceAttachments,
  };
}
