import { isAppScaffold, type BuildIntent } from "@/lib/builder/build-intent";
import type { BuildSpec, BuildSpecQualityTarget } from "../build-spec";

/**
 * P26 / OMTAG Fas 2·A — pure helper for the `build_intent_promoted` gate.
 *
 * Before PR1 landed, an auto-scaffold fallback to `app-shell` on a follow-up
 * could flip a `website` project's build intent to `app` permanently,
 * drowning out every subsequent turn's route plan and build spec. PR1
 * introduced a block: on follow-up runs that already carry a persisted
 * non-app scaffold, the promotion is suppressed. This helper exposes the
 * pure boolean logic so the decision is unit-testable in isolation instead
 * of hidden inside the big orchestrate function.
 *
 * Init runs and explicit `clear-redesign` follow-ups (where the caller sets
 * `ignorePersistedScaffoldForMatch`) are still allowed to promote.
 */
export interface BuildIntentPromotionInput {
  buildIntent: BuildIntent;
  scaffoldMode: "auto" | "manual" | "off";
  resolvedScaffoldId: string | null;
  selectionConfidence: "high" | "medium" | "low" | null;
  resolvedMode: "init" | "followUp";
  persistedScaffoldId: string | null | undefined;
  ignorePersistedScaffoldForMatch: boolean;
  /**
   * The user picked Hemsida/App themselves in Byggval, rather than the intent
   * being inherited from whichever landing entry they arrived through.
   *
   * Promotion exists for the inherited case: `website` was then a default, so an
   * auto-matched dashboard was better evidence of what the user wanted. An
   * explicit "Hemsida" is not a default, and overriding it would let a stray
   * "dashboard" in the prompt hand back an app the user just declined.
   *
   * INIT-SCOPED. Byggval sends the flag on the create request only; it is not
   * stored in the orchestration snapshot, so follow-ups arrive without it. Neutral
   * follow-ups are covered anyway by `blockedForFollowUp` (a persisted non-app
   * scaffold already blocks promotion). A `clear-redesign` follow-up is NOT: it
   * releases the scaffold lock on purpose, so app vocabulary in the redesign
   * prompt can still promote. That matches the behaviour before this flag existed
   * — carrying the choice across rounds means persisting it in the snapshot, which
   * is a schema decision rather than a tweak here.
   */
  buildIntentExplicit?: boolean;
}

export interface BuildIntentPromotionDecision {
  /** Promotion criteria satisfied before the follow-up guard. */
  wouldPromote: boolean;
  /** Promotion suppressed because we are on a follow-up with a persisted non-app scaffold. */
  blockedForFollowUp: boolean;
  /** Final answer — whether the effective build intent should be promoted to `app`. */
  promoted: boolean;
}

export function resolveBuildIntentPromotion(
  input: BuildIntentPromotionInput,
): BuildIntentPromotionDecision {
  const wouldPromote =
    input.buildIntent === "website" &&
    input.buildIntentExplicit !== true &&
    input.scaffoldMode === "auto" &&
    isAppScaffold(input.resolvedScaffoldId) &&
    input.selectionConfidence !== "low";
  const blockedForFollowUp =
    wouldPromote &&
    input.resolvedMode === "followUp" &&
    !!input.persistedScaffoldId &&
    !input.ignorePersistedScaffoldForMatch &&
    !isAppScaffold(input.persistedScaffoldId);
  return {
    wouldPromote,
    blockedForFollowUp,
    promoted: wouldPromote && !blockedForFollowUp,
  };
}

/** Quality-target rank: higher rank = stronger quality signal. */
const QUALITY_TARGET_RANK: Record<BuildSpecQualityTarget, number> = {
  standard: 0,
  premium: 1,
  "release-candidate": 2,
};

/**
 * P22: när vi kör en follow-up och en tidigare accepterad version finns
 * (med en `qualityTarget` i sin orchestration-snapshot) ska vi ärva det
 * värdet i stället för att räkna om från scratch. Det stoppar dubbel-
 * loggen `quality_target_promoted_for_multipage` på samma chat och säkrar
 * att senare turns inte plötsligt ändrar kvalitetstak.
 *
 * Inheritance får aldrig SÄNKA qualityTarget. Om baseSpec just blivit
 * promoted (t.ex. multipage → premium, eller F3 → release-candidate) och
 * priorQualityTarget är lägre, behåller vi baseSpec. Skälet: en användare
 * som ber om "snyggare", lägger till routes, eller startar integrationsbygget får
 * inte tappa kvalitetsambition bara för att förra version råkade ha lägre rank. Loggar
 * `quality_target_inheritance_blocked` så vi kan följa när det händer.
 *
 * Faller tillbaka till `baseSpec` oförändrat när:
 *  - `generationMode !== "followUp"`
 *  - inget `priorQualityTarget` finns
 *  - värdet redan matchar baseSpec
 *  - priorQualityTarget skulle sänka aktuell rank
 */
export function inheritQualityTargetFromPriorVersion(
  chatId: string | null | undefined,
  baseSpec: BuildSpec,
  priorQualityTarget?: BuildSpecQualityTarget | null,
): BuildSpec {
  if (baseSpec.generationMode !== "followUp") return baseSpec;
  if (!priorQualityTarget) return baseSpec;
  if (priorQualityTarget === baseSpec.qualityTarget) return baseSpec;
  const priorRank = QUALITY_TARGET_RANK[priorQualityTarget];
  const baseRank = QUALITY_TARGET_RANK[baseSpec.qualityTarget];
  if (priorRank < baseRank) {
    console.info("[orchestrate] quality_target_inheritance_blocked", {
      chatId: chatId ?? null,
      baseSpec: baseSpec.qualityTarget,
      prior: priorQualityTarget,
      reason: "would_lower_quality",
    });
    return baseSpec;
  }
  console.info("[orchestrate] quality_target_inherited_from_prior_version", {
    chatId: chatId ?? null,
    from: baseSpec.qualityTarget,
    to: priorQualityTarget,
  });
  return { ...baseSpec, qualityTarget: priorQualityTarget };
}
