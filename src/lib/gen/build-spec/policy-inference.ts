/**
 * Policy inference: changeScope, qualityTarget, previewPolicy,
 * verificationPolicy, contextPolicy + the small-follow-up helper used
 * by `deriveFollowUpContextPolicy`.
 *
 * Split out of `build-spec.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import {
  looksDesignHeavyMessage,
  type PromptStrategyMeta,
} from "@/lib/builder/promptOrchestration";
import type { FollowUpIntentMode } from "../follow-up-intent-types";
import type { PreGenerationContractContext } from "../contract/pre-generation-contracts";
import type { RoutePlan } from "../route-plan";
import type { ScaffoldManifest } from "../scaffolds/types";
import { effectiveInitRouteCount } from "./route-realization";
import {
  COPY_GUARD_PATTERNS,
  COPY_PATTERNS,
  IMAGERY_FOLLOWUP_ESCAPE_PATTERNS,
  INTEGRATION_PATTERNS,
  LAYOUT_PATTERNS,
  PAGE_ADDITION_PATTERNS,
  REDESIGN_PATTERNS,
  SMALL_FOLLOW_UP_HINT_PATTERNS,
  SMALL_FOLLOW_UP_TARGET_PATTERNS,
  TARGETED_REPAIR_PATTERNS,
  includesAny,
  isInPageSectionRequest,
} from "./prompt-patterns";
import type {
  BuildSpecChangeScope,
  BuildSpecContextPolicy,
  BuildSpecGenerationMode,
  BuildSpecPreviewPolicy,
  BuildSpecQualityTarget,
  BuildSpecVerificationPolicy,
  RouteRealizationPolicy,
} from "./types";

export type PromptStrategyMetaForBuildSpec = Pick<
  PromptStrategyMeta,
  "strategy" | "promptType"
> &
  Partial<Pick<PromptStrategyMeta, "complexityScore">>;

export type BuildSpecBriefSignals = {
  qualityBar?: "clean" | "premium" | "bold-dramatic" | string | null;
  motionLevel?: "minimal" | "moderate" | "lively" | string | null;
  domainProfile?: string | null;
  visualDirection?: {
    styleKeywords?: string[] | null;
    typography?: {
      headings?: string | null;
      body?: string | null;
    } | null;
  } | null;
  toneAndVoice?: string[] | null;
} | null;

/**
 * Promotionsord som signalerar att användaren förväntar sig en visuellt
 * ambitiös, detaljrik leverans. Träffar trippar `qualityTarget = "premium"`
 * även när strukturella signaler (routes, integrations, scaffold-id) saknas.
 *
 * Hålls smal med vilja — ord som "site", "snabb", "enkel" får inte ligga här.
 * Lägg gärna till nya ord vid behov, men logga `quality_target_promoted_for_keyword`
 * i prod först och se om det matchar något verkligt mönster.
 */
const QUALITY_PREMIUM_KEYWORDS = [
  // svenska
  "snygg",
  "snyggt",
  "snygga",
  "påkostad",
  "påkostat",
  "lyxig",
  "lyxigt",
  "exklusiv",
  "exklusivt",
  "rockig",
  "rockigt",
  "atmosfärisk",
  "atmosfäriskt",
  "stämningsfull",
  "stämningsfullt",
  "dramatisk",
  "dramatiskt",
  "detaljrik",
  "detaljrikt",
  // english (svenska "premium" täcker engelska "premium" via samma sträng)
  "premium",
  "luxury",
  "luxurious",
  "elegant",
  "polished",
  "atmospheric",
  "moody",
  "dramatic",
  "high-end",
  "boutique",
  "editorial",
  "cinematic",
  "immersive",
] as const;

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchQualityPremiumKeyword(prompt: string): string | null {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();
  for (const word of QUALITY_PREMIUM_KEYWORDS) {
    // Word-boundary respekterande svensk diakritik. Inte ASCII-`\b`.
    const pattern = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escapeRegExpLiteral(word.toLowerCase())}(?:[^\\p{L}\\p{N}]|$)`,
      "iu",
    );
    if (pattern.test(lower)) return word;
  }
  return null;
}

export function inferChangeScope(params: {
  prompt: string;
  generationMode: BuildSpecGenerationMode;
  routePlan: RoutePlan;
  preGenerationContracts: PreGenerationContractContext;
}): BuildSpecChangeScope {
  const { prompt, generationMode, routePlan, preGenerationContracts } = params;
  const integrationCount = preGenerationContracts.contracts.integrations.length;
  const promptLower = prompt.toLowerCase();

  if (generationMode === "init") {
    if (
      integrationCount > 0 ||
      preGenerationContracts.contracts.dataMode === "persisted" ||
      Boolean(preGenerationContracts.contracts.databaseProvider) ||
      Boolean(preGenerationContracts.contracts.authProvider) ||
      Boolean(preGenerationContracts.contracts.paymentProvider)
    ) {
      return "integration";
    }
    if (routePlan.routes.length > 1) return "page-addition";
    return "redesign";
  }

  if (includesAny(REDESIGN_PATTERNS, promptLower)) return "redesign";
  if (
    integrationCount > 0 &&
    includesAny(INTEGRATION_PATTERNS, promptLower)
  ) {
    return "integration";
  }
  if (
    includesAny(PAGE_ADDITION_PATTERNS, promptLower) &&
    !isInPageSectionRequest(promptLower)
  ) {
    return "page-addition";
  }
  if (
    includesAny(COPY_PATTERNS, promptLower) &&
    (!includesAny(LAYOUT_PATTERNS, promptLower) || includesAny(COPY_GUARD_PATTERNS, promptLower))
  ) {
    return "copy";
  }
  if (includesAny(LAYOUT_PATTERNS, promptLower)) return "local-layout";
  return "local-layout";
}

export function inferQualityTarget(params: {
  prompt: string;
  buildIntent: BuildIntent;
  generationMode: BuildSpecGenerationMode;
  resolvedScaffold: ScaffoldManifest | null;
  routePlan: RoutePlan;
  routeRealization: RouteRealizationPolicy;
  preGenerationContracts: PreGenerationContractContext;
  /** Explicit override — F3 lifecycle stage forces release-candidate. */
  previewPolicy: BuildSpecPreviewPolicy;
  isFirstCodeGeneration?: boolean | null;
  brief?: BuildSpecBriefSignals;
}): BuildSpecQualityTarget {
  const {
    prompt,
    buildIntent,
    generationMode,
    resolvedScaffold,
    routePlan,
    routeRealization,
    preGenerationContracts,
    previewPolicy,
    isFirstCodeGeneration,
    brief,
  } = params;
  if (previewPolicy === "fidelity3") return "release-candidate";

  const briefQualityBar =
    typeof brief?.qualityBar === "string" ? brief.qualityBar.trim() : "";
  if (
    generationMode === "init" &&
    (briefQualityBar === "premium" || briefQualityBar === "bold-dramatic")
  ) {
    console.info("[build-spec] quality_target_promoted_for_brief_quality_bar", {
      qualityBar: briefQualityBar,
      generationMode,
      buildIntent,
      from: "standard",
      to: "premium",
    });
    return "premium";
  }

  const advancedScaffoldId =
    resolvedScaffold?.id === "dashboard" ||
    resolvedScaffold?.id === "ecommerce" ||
    resolvedScaffold?.id === "app-shell" ||
    resolvedScaffold?.id === "saas-landing";
  const routeCount = effectiveInitRouteCount({
    generationMode,
    routePlan,
    routeRealization,
    isFirstCodeGeneration,
  });
  const premiumSignals =
    buildIntent === "app" ||
    routeCount > 4 ||
    routePlan.siteType === "content-heavy" ||
    (routePlan.provenance.primarySource === "scaffold" && routeCount >= 3) ||
    preGenerationContracts.contracts.integrations.length > 0 ||
    preGenerationContracts.contracts.dataMode === "persisted" ||
    advancedScaffoldId;

  // Multi-page renders that don't otherwise trip a premium signal still
  // benefit from the higher token / verification budget — single-route
  // landings have one chance to look right, but every additional route
  // multiplies the surface area where a "standard" budget can drop visual
  // polish or cross-route consistency. Promote when we're rendering more
  // than one route at init.
  if (!premiumSignals && routeCount > 1) {
    console.info("[build-spec] quality_target_promoted_for_multipage", {
      routeCount,
      buildIntent,
      generationMode,
      scaffoldId: resolvedScaffold?.id ?? null,
      from: "standard",
      to: "premium",
    });
    return "premium";
  }

  const matchedWord =
    generationMode === "init" ? matchQualityPremiumKeyword(prompt) : null;
  if (matchedWord) {
    console.info("[build-spec] quality_target_promoted_for_keyword", {
      matchedWord,
      generationMode,
      scaffoldId: resolvedScaffold?.id ?? null,
      buildIntent,
      from: "standard",
      to: "premium",
    });
    return "premium";
  }

  return premiumSignals ? "premium" : "standard";
}

/**
 * Default `previewPolicy`. **Always returns `fidelity2`.** F3 is opt-in via
 * `DeriveBuildSpecParams.previewPolicyOverride`, set explicitly by the
 * "Bygg integrationer" button (`POST .../finalize-design`). Auto-promotion
 * by prompt content or buildIntent shape was removed 2026-04 because it
 * caused unwanted F3 builds whenever a prompt happened to mention "deploy"
 * or "production".
 */
export function inferPreviewPolicy(): BuildSpecPreviewPolicy {
  return "fidelity2";
}

export function inferVerificationPolicy(params: {
  generationMode: BuildSpecGenerationMode;
  changeScope: BuildSpecChangeScope;
  previewPolicy: BuildSpecPreviewPolicy;
  capabilityHeavy: boolean;
}): BuildSpecVerificationPolicy {
  const { generationMode, changeScope, previewPolicy, capabilityHeavy } = params;
  if (previewPolicy === "fidelity3") return "strict";
  if (generationMode === "followUp" && capabilityHeavy) return "standard";
  if (generationMode === "followUp" && changeScope === "copy") {
    return "fast";
  }
  return "standard";
}

function isExplicitSmallFollowUpPrompt(prompt: string): boolean {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.length > 420) return false;
  if (includesAny(IMAGERY_FOLLOWUP_ESCAPE_PATTERNS, trimmedPrompt)) return false;
  if (includesAny(COPY_PATTERNS, trimmedPrompt)) return true;
  if (
    includesAny(LAYOUT_PATTERNS, trimmedPrompt) &&
    (includesAny(SMALL_FOLLOW_UP_TARGET_PATTERNS, trimmedPrompt) ||
      isInPageSectionRequest(trimmedPrompt.toLowerCase()))
  ) {
    return true;
  }
  return (
    includesAny(SMALL_FOLLOW_UP_HINT_PATTERNS, trimmedPrompt) &&
    includesAny(SMALL_FOLLOW_UP_TARGET_PATTERNS, trimmedPrompt)
  );
}

export function deriveFollowUpContextPolicy(params: {
  prompt: string;
  skipIntentClassification?: boolean;
  followUpIntent?: FollowUpIntentMode;
  capabilityHeavy: boolean;
}): BuildSpecContextPolicy {
  const {
    prompt,
    skipIntentClassification = false,
    followUpIntent = "neutral",
    capabilityHeavy,
  } = params;
  if (skipIntentClassification) return "normal";
  if (followUpIntent === "clear-redesign") return "normal";
  if (capabilityHeavy) return "normal";
  if (looksDesignHeavyMessage(prompt)) return "normal";
  if (isExplicitSmallFollowUpPrompt(prompt)) return "light";
  return "normal";
}

/**
 * Signal-summed weights for `inferContextPolicy`. The previous version was
 * a binary OR over a handful of conditions; any single hit jumped straight
 * from `normal` to `heavy` and the boundary cases (e.g. 4 vs 5 routes) were
 * unnecessarily lossy.
 *
 * Now we sum signal weights and threshold:
 *   - score >= HEAVY_THRESHOLD → "heavy"
 *   - else → "normal"
 *
 * Weights are intentionally small integers so that a *combination* of
 * mid-strength signals can still cross HEAVY without any single signal
 * being decisive — except integrations, which alone are a strong indicator
 * of "model needs the extra room to wire things together correctly".
 */
// Q5b (2026-04-21): lowered from 4 → 3 to push more borderline cases into
// `heavy`. Combined with the new `complexityScore`-input below this nets
// roughly 5–15% more requests on heavy budgets — accepted cost for fewer
// "section truncated" pruning incidents on rich prompts. Backfill via env:
// `SAJTMASKIN_CONTEXT_POLICY_HEAVY_THRESHOLD=4` restores the old behavior.
const CONTEXT_POLICY_HEAVY_THRESHOLD =
  Number.parseInt(process.env.SAJTMASKIN_CONTEXT_POLICY_HEAVY_THRESHOLD ?? "", 10) || 3;

// Threshold at which `analyzeComplexity().score` from prompt orchestration
// is treated as "high enough to add a heavy-bias signal".
const COMPLEXITY_SCORE_HEAVY_BIAS_THRESHOLD = 4;

function scoreContextPolicy(params: {
  generationMode: BuildSpecGenerationMode;
  buildIntent: BuildIntent;
  routePlan: RoutePlan;
  routeRealization: RouteRealizationPolicy;
  preGenerationContracts: PreGenerationContractContext;
  promptStrategyMeta?: PromptStrategyMetaForBuildSpec | null;
  capabilityHeavy: boolean;
  isFirstCodeGeneration?: boolean | null;
  brief?: BuildSpecBriefSignals;
}): number {
  const {
    generationMode,
    buildIntent,
    routePlan,
    routeRealization,
    preGenerationContracts,
    promptStrategyMeta,
    capabilityHeavy,
    isFirstCodeGeneration,
    brief,
  } = params;
  let score = 0;

  if (generationMode === "init") score += 1;
  if (buildIntent === "app") score += 2;
  if (capabilityHeavy) score += 1;
  if (generationMode === "init" && brief?.qualityBar === "bold-dramatic") score += 2;
  else if (generationMode === "init" && brief?.qualityBar === "premium") score += 1;
  if (generationMode === "init" && brief?.motionLevel === "lively") score += 1;

  if (
    promptStrategyMeta?.strategy === "phase_plan_build_refine" ||
    promptStrategyMeta?.strategy === "preserved"
  ) {
    score += 2;
  }

  // Q5b: high prompt complexity (many bullets, sections, requirement keywords,
  // attachments) gets a heavy-bias bump. analyzeComplexity returns 0–9.
  if (
    typeof promptStrategyMeta?.complexityScore === "number" &&
    promptStrategyMeta.complexityScore >= COMPLEXITY_SCORE_HEAVY_BIAS_THRESHOLD
  ) {
    score += 1;
  }

  const integrationCount = preGenerationContracts.contracts.integrations.length;
  if (integrationCount > 0) score += 3;
  if (integrationCount >= 3) score += 1;
  if (preGenerationContracts.contracts.dataMode === "persisted") score += 2;

  const routeCount = effectiveInitRouteCount({
    generationMode,
    routePlan,
    routeRealization,
    isFirstCodeGeneration,
  });
  if (routeCount > 4) score += 2;
  else if (routeCount >= 3) score += 1;

  const routePlanHeavyStructure =
    routePlan.siteType === "app-shell" ||
    (routePlan.siteType === "content-heavy" && routeCount > 1) ||
    (routePlan.provenance.primarySource === "scaffold" && routeCount >= 3);
  if (routePlanHeavyStructure) score += 2;

  return score;
}

export function inferContextPolicy(params: {
  prompt: string;
  generationMode: BuildSpecGenerationMode;
  changeScope: BuildSpecChangeScope;
  buildIntent: BuildIntent;
  routePlan: RoutePlan;
  routeRealization: RouteRealizationPolicy;
  preGenerationContracts: PreGenerationContractContext;
  promptStrategyMeta?: PromptStrategyMetaForBuildSpec | null;
  capabilityHeavy: boolean;
  isFirstCodeGeneration?: boolean | null;
  brief?: BuildSpecBriefSignals;
}): { policy: BuildSpecContextPolicy; score: number } {
  const {
    prompt,
    generationMode,
    changeScope,
    capabilityHeavy,
  } = params;
  if (generationMode === "followUp" && (changeScope === "copy" || changeScope === "local-layout")) {
    if (includesAny(TARGETED_REPAIR_PATTERNS, prompt)) {
      return { policy: "normal", score: 0 };
    }
    return {
      policy: deriveFollowUpContextPolicy({ prompt, capabilityHeavy }),
      score: 0,
    };
  }

  const score = scoreContextPolicy(params);
  if (score >= CONTEXT_POLICY_HEAVY_THRESHOLD) {
    return { policy: "heavy", score };
  }
  return { policy: "normal", score };
}
