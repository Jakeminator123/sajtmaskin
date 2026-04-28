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
 * som ber om "snyggare", lägger till routes, eller startar F3-bygget får
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
