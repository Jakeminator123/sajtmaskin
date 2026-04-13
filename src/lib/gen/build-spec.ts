import type { BuildIntent } from "@/lib/builder/build-intent";
import {
  looksDesignHeavyMessage,
  type PromptStrategyMeta,
} from "@/lib/builder/promptOrchestration";
import { FEATURES } from "@/lib/config";
import {
  hasHeavyCapabilities,
  type InferredCapabilities,
} from "./capability-inference";
import type { PreGenerationContractContext } from "./contract/pre-generation-contracts";
import type { RoutePlan } from "./route-plan";
import type { ScaffoldId, ScaffoldManifest } from "./scaffolds/types";

export type BuildSpecGenerationMode = "init" | "followUp";
export type BuildSpecChangeScope =
  | "copy"
  | "local-layout"
  | "page-addition"
  | "redesign"
  | "integration";
export type BuildSpecQualityTarget = "standard" | "premium" | "release-candidate";
export type BuildSpecPreviewPolicy = "fidelity2" | "fidelity3";
export type BuildSpecVerificationPolicy = "fast" | "standard" | "strict";
export type BuildSpecContextPolicy = "light" | "normal" | "heavy";

/**
 * Token fields drive runtime budgets (`systemContextTokens`, etc.).
 * `*Chars` fields are approximate compat mirrors via `estimateCharsForTokens` for
 * char-oriented call-sites (e.g. scaffold serialization), not a second source of truth.
 */
export interface BuildSpecTokenBudgets {
  scaffoldTokens?: number;
  refsTokens?: number;
  systemContextTokens?: number;
  scaffoldChars: number;
  refsChars: number;
  systemContextChars: number;
}

export interface RouteRealizationPolicy {
  mode: "full" | "primary-full-with-shells";
  primaryRoutePath: string;
  fullRoutePaths: string[];
  shellRoutePaths: string[];
}

export interface BuildSpec {
  buildIntent: BuildIntent;
  generationMode: BuildSpecGenerationMode;
  changeScope: BuildSpecChangeScope;
  scaffoldId: ScaffoldId | null;
  routePlanSummary: string;
  stylePack: string;
  qualityTarget: BuildSpecQualityTarget;
  previewPolicy: BuildSpecPreviewPolicy;
  verificationPolicy: BuildSpecVerificationPolicy;
  contextPolicy: BuildSpecContextPolicy;
  referenceCategories: string[];
  forbiddenPatterns: string[];
  tokenBudgets: BuildSpecTokenBudgets;
  routeRealization?: RouteRealizationPolicy;
}

type DeriveBuildSpecParams = {
  prompt: string;
  buildIntent: BuildIntent;
  generationMode: BuildSpecGenerationMode;
  resolvedScaffold: ScaffoldManifest | null;
  routePlan: RoutePlan;
  preGenerationContracts: PreGenerationContractContext;
  promptStrategyMeta?: Pick<PromptStrategyMeta, "strategy" | "promptType"> | null;
  capabilities?: InferredCapabilities | null;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWordPatterns(values: readonly string[]): RegExp[] {
  return values.map((value) => new RegExp(`\\b${escapeRegex(value)}\\b`, "i"));
}

function phrasePatterns(values: readonly string[]): RegExp[] {
  return values.map((value) => {
    const escaped = escapeRegex(value).replace(/\\ /g, "\\s+");
    return new RegExp(`\\b${escaped}\\b`, "i");
  });
}

const RELEASE_CANDIDATE_PATTERNS = [
  ...phrasePatterns(["release candidate", "ready for production", "launch"]),
  /\bdeploy[- ]ready\b/i,
  /\bprod(?:uction)?[- ]ready\b/i,
];

const REDESIGN_PATTERNS = phrasePatterns([
  "redesign",
  "rebrand",
  "restyle",
  "start over",
  "from scratch",
  "helt ny riktning",
  "gör om från grunden",
]);

const COPY_PATTERNS = wholeWordPatterns([
  "copy",
  "text",
  "innehåll",
  "content",
  "headline",
  "tagline",
  "seo",
  "meta",
  "wording",
]);

const COPY_GUARD_PATTERNS = [
  /\bbehåll(?:er)?\b.*\bdesign(?:en)?\b/i,
  /\bbehåll(?:er)?\b.*\blayout(?:en)?\b/i,
  /\bkeep\b.*\bdesign\b/i,
  /\bkeep\b.*\blayout\b/i,
  /\bwithout changing\b.*\bdesign\b/i,
  /\bwithout changing\b.*\blayout\b/i,
];

const LAYOUT_PATTERNS = wholeWordPatterns([
  "layout",
  "spacing",
  "färg",
  "color",
  "palette",
  "hero",
  "footer",
  "header",
  "animation",
  "motion",
  "design",
  "visual",
]);

const PAGE_ADDITION_PATTERNS = [
  /\badd(?: another)?(?: new)? (?:page|route)\b/i,
  /\bcreate(?: another)?(?: new)? (?:page|route)\b/i,
  /\bnew page\b/i,
  /\bnew route\b/i,
  /\blägg till sida\b/i,
  /\blägg till (?:en |en ny |ny )?(?:sida|route)\b/i,
  /\bny sida\b/i,
  /\bny route\b/i,
  /\b(?:pricing|blog|contact|about|services|products?) page\b/i,
  /\bkontaktsida\b/i,
];

const TARGETED_REPAIR_PATTERNS = [
  /\bauto-fix request\b/i,
  /\btargeted repair\b/i,
  /\bpersisted errors for this version\b/i,
  /\bquality gate\b/i,
];

const IMAGE_FOLLOWUP_ESCAPE_PATTERNS = [
  /\b(?:bild(?:en|er|erna)?|image(?:s|ry)?|foto(?:n)?|photo(?:s)?)\b/i,
  /\bplaceholder(?:s|\.svg)?\b/i,
  /\b(?:ai[- ]?bild|ai[- ]?image|generera bild|generate image)\b/i,
  /\b(?:byt|ersätt|replace|swap).{0,20}(?:bild|image|hero[- ]?bild|hero[- ]?image|placeholder)\b/i,
  /\b(?:materialisera|materialize)\b/i,
];

const SMALL_FOLLOW_UP_HINT_PATTERNS = [
  ...wholeWordPatterns(["bara", "endast", "enbart", "only", "just", "snabbt", "liten", "lite", "minor", "small"]),
  /\b(?:tighten|trim|justera|polera|byt bara|ändra bara|uppdatera bara)\b/i,
];

const SMALL_FOLLOW_UP_TARGET_PATTERNS = [
  /\b(?:rubrik(?:en)?|titel(?:n)?|heading|copy|text|cta|spacing|marginal|padding|color|färg|font|button|knapp|hero|footer|header|ikon|icon)\b/i,
];

const INTEGRATION_PATTERNS = wholeWordPatterns([
  "integration",
  "api",
  "database",
  "databas",
  "auth",
  "stripe",
  "supabase",
  "prisma",
  "drizzle",
  "clerk",
  "nextauth",
  "auth0",
  "openai",
  "resend",
  "redis",
  "upstash",
]);

function includesAny(patterns: RegExp[], value: string): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function buildRoutePlanSummary(routePlan: RoutePlan): string {
  const routes = routePlan.routes
    .slice(0, 8)
    .map((route) => route.path)
    .join(",");
  return `${routePlan.provenance.primarySource}:${routePlan.siteType}:${routes || "/"}`;
}

function choosePrimaryRoutePath(params: {
  buildIntent: BuildIntent;
  routePlan: RoutePlan;
  prompt: string;
}): string {
  const { buildIntent, routePlan, prompt } = params;
  const normalizedPrompt = prompt.toLowerCase();
  const routePaths = routePlan.routes.map((route) => route.path);
  const rootRoute = routePlan.routes.find((route) => route.path === "/");
  const dashboardLikePath = routePlan.routes.find((route) =>
    ["/dashboard", "/app", "/workspace"].includes(route.path),
  )?.path;

  if (buildIntent === "app") {
    if (/\b(dashboard|instrumentpanel|workspace|app shell)\b/i.test(normalizedPrompt)) {
      return dashboardLikePath ?? rootRoute?.path ?? routePaths[0] ?? "/";
    }
    return rootRoute?.path ?? dashboardLikePath ?? routePaths[0] ?? "/";
  }

  if (rootRoute) return rootRoute.path;
  return routePaths[0] ?? "/";
}

function deriveRouteRealizationPolicy(params: {
  generationMode: BuildSpecGenerationMode;
  buildIntent: BuildIntent;
  prompt: string;
  routePlan: RoutePlan;
}): RouteRealizationPolicy {
  const { generationMode, buildIntent, prompt, routePlan } = params;
  const allRoutePaths = routePlan.routes.map((route) => route.path);
  const primaryRoutePath = choosePrimaryRoutePath({ buildIntent, routePlan, prompt });

  if (
    generationMode !== "init" ||
    !FEATURES.deferExtraRoutesOnInit ||
    allRoutePaths.length <= 1
  ) {
    return {
      mode: "full",
      primaryRoutePath,
      fullRoutePaths: allRoutePaths,
      shellRoutePaths: [],
    };
  }

  return {
    mode: "primary-full-with-shells",
    primaryRoutePath,
    fullRoutePaths: [primaryRoutePath],
    shellRoutePaths: allRoutePaths.filter((path) => path !== primaryRoutePath),
  };
}

function effectiveInitRouteCount(params: {
  generationMode: BuildSpecGenerationMode;
  routePlan: RoutePlan;
  routeRealization: RouteRealizationPolicy;
}): number {
  const { generationMode, routePlan, routeRealization } = params;
  if (
    generationMode === "init" &&
    routeRealization.mode === "primary-full-with-shells"
  ) {
    return routeRealization.fullRoutePaths.length;
  }
  return routePlan.routes.length;
}

function inferStylePack(
  prompt: string,
  buildIntent: BuildIntent,
  resolvedScaffold: ScaffoldManifest | null,
  changeScope: BuildSpecChangeScope,
): string {
  const promptLower = prompt.toLowerCase();
  if (/\bbrutalist\b/i.test(promptLower)) return "brutalist";
  if (/\beditorial\b/i.test(promptLower)) return "editorial";
  if (/\bminimal(?:ist)?\b/i.test(promptLower)) return "minimal";
  if (/\bluxury\b/i.test(promptLower)) return "luxury";
  if (/\bplayful\b/i.test(promptLower)) return "playful";
  if (/\bretro\b|\bvintage\b/i.test(promptLower)) return "retro";
  if (/\bfuturistic\b|\bcyberpunk\b/i.test(promptLower)) return "futuristic";
  if (resolvedScaffold?.id === "blog") return "editorial";
  if (resolvedScaffold?.id === "ecommerce") return "commerce";
  if (resolvedScaffold?.id === "saas-landing") return "saas";
  if (buildIntent === "app") return "app-product";
  if (changeScope === "copy") return "current-site";
  return "brand-led";
}

function inferChangeScope(params: {
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
  if (includesAny(PAGE_ADDITION_PATTERNS, promptLower)) return "page-addition";
  if (
    includesAny(COPY_PATTERNS, promptLower) &&
    (!includesAny(LAYOUT_PATTERNS, promptLower) || includesAny(COPY_GUARD_PATTERNS, promptLower))
  ) {
    return "copy";
  }
  if (includesAny(LAYOUT_PATTERNS, promptLower)) return "local-layout";
  return "local-layout";
}

function inferQualityTarget(params: {
  prompt: string;
  buildIntent: BuildIntent;
  generationMode: BuildSpecGenerationMode;
  resolvedScaffold: ScaffoldManifest | null;
  routePlan: RoutePlan;
  routeRealization: RouteRealizationPolicy;
  preGenerationContracts: PreGenerationContractContext;
}): BuildSpecQualityTarget {
  const {
    prompt,
    buildIntent,
    generationMode,
    resolvedScaffold,
    routePlan,
    routeRealization,
    preGenerationContracts,
  } = params;
  if (includesAny(RELEASE_CANDIDATE_PATTERNS, prompt)) return "release-candidate";

  const advancedScaffoldId =
    resolvedScaffold?.id === "dashboard" ||
    resolvedScaffold?.id === "ecommerce" ||
    resolvedScaffold?.id === "app-shell" ||
    resolvedScaffold?.id === "saas-landing";
  const routeCount = effectiveInitRouteCount({
    generationMode,
    routePlan,
    routeRealization,
  });
  const premiumSignals =
    buildIntent === "app" ||
    routeCount > 4 ||
    routePlan.siteType === "content-heavy" ||
    (routePlan.provenance.primarySource === "scaffold" && routeCount >= 3) ||
    preGenerationContracts.contracts.integrations.length > 0 ||
    preGenerationContracts.contracts.dataMode === "persisted" ||
    advancedScaffoldId;

  return premiumSignals ? "premium" : "standard";
}

function inferPreviewPolicy(params: {
  prompt: string;
  generationMode: BuildSpecGenerationMode;
  qualityTarget: BuildSpecQualityTarget;
  routePlan: RoutePlan;
  routeRealization: RouteRealizationPolicy;
  preGenerationContracts: PreGenerationContractContext;
  buildIntent: BuildIntent;
}): BuildSpecPreviewPolicy {
  const {
    prompt,
    generationMode,
    qualityTarget,
    routePlan,
    routeRealization,
    preGenerationContracts,
    buildIntent,
  } = params;
  const routeCount = effectiveInitRouteCount({
    generationMode,
    routePlan,
    routeRealization,
  });
  if (qualityTarget === "release-candidate") return "fidelity3";
  if (
    buildIntent === "app" &&
    (preGenerationContracts.contracts.integrations.length > 1 || routeCount > 4)
  ) {
    return "fidelity3";
  }
  if (includesAny(RELEASE_CANDIDATE_PATTERNS, prompt)) return "fidelity3";
  return "fidelity2";
}

function inferVerificationPolicy(params: {
  generationMode: BuildSpecGenerationMode;
  changeScope: BuildSpecChangeScope;
  previewPolicy: BuildSpecPreviewPolicy;
  capabilityHeavy: boolean;
}): BuildSpecVerificationPolicy {
  const { generationMode, changeScope, previewPolicy, capabilityHeavy } = params;
  if (previewPolicy === "fidelity3") return "strict";
  if (generationMode === "followUp" && capabilityHeavy) return "standard";
  if (generationMode === "followUp" && (changeScope === "copy" || changeScope === "local-layout")) {
    return "fast";
  }
  return "standard";
}

function isExplicitSmallFollowUpPrompt(prompt: string): boolean {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.length > 220) return false;
  if (includesAny(IMAGE_FOLLOWUP_ESCAPE_PATTERNS, trimmedPrompt)) return false;
  return (
    includesAny(SMALL_FOLLOW_UP_HINT_PATTERNS, trimmedPrompt) &&
    includesAny(SMALL_FOLLOW_UP_TARGET_PATTERNS, trimmedPrompt)
  );
}

export function deriveFollowUpContextPolicy(params: {
  prompt: string;
  skipIntentClassification?: boolean;
  followUpIntent?: "clear-redesign" | "clear-refine" | "ambiguous-redesign" | "ambiguous-followup" | "neutral";
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

function inferContextPolicy(params: {
  prompt: string;
  generationMode: BuildSpecGenerationMode;
  changeScope: BuildSpecChangeScope;
  buildIntent: BuildIntent;
  routePlan: RoutePlan;
  routeRealization: RouteRealizationPolicy;
  preGenerationContracts: PreGenerationContractContext;
  promptStrategyMeta?: Pick<PromptStrategyMeta, "strategy" | "promptType"> | null;
  capabilityHeavy: boolean;
}): BuildSpecContextPolicy {
  const {
    prompt,
    generationMode,
    changeScope,
    buildIntent,
    routePlan,
    routeRealization,
    preGenerationContracts,
    promptStrategyMeta,
    capabilityHeavy,
  } = params;
  if (generationMode === "followUp" && (changeScope === "copy" || changeScope === "local-layout")) {
    if (includesAny(TARGETED_REPAIR_PATTERNS, prompt)) {
      return "normal";
    }
    return deriveFollowUpContextPolicy({
      prompt,
      capabilityHeavy,
    });
  }
  const routePlanHeavyStructure =
    routePlan.siteType === "app-shell" ||
    (routePlan.siteType === "content-heavy" &&
      effectiveInitRouteCount({
        generationMode,
        routePlan,
        routeRealization,
      }) > 1) ||
    (routePlan.provenance.primarySource === "scaffold" &&
      effectiveInitRouteCount({
        generationMode,
        routePlan,
        routeRealization,
      }) >= 3);

  const routeCount = effectiveInitRouteCount({
    generationMode,
    routePlan,
    routeRealization,
  });

  if (
    promptStrategyMeta?.strategy === "phase_plan_build_refine" ||
    promptStrategyMeta?.strategy === "preserved" ||
    buildIntent === "app" ||
    routeCount > 4 ||
    routePlanHeavyStructure ||
    preGenerationContracts.contracts.integrations.length > 0 ||
    preGenerationContracts.contracts.dataMode === "persisted"
  ) {
    return "heavy";
  }
  return "normal";
}

function tokenBudgetsForContextPolicy(contextPolicy: BuildSpecContextPolicy): BuildSpecTokenBudgets {
  switch (contextPolicy) {
    case "light":
      return {
        scaffoldTokens: 11_250,
        refsTokens: 3_750,
        systemContextTokens: 15_000,
        scaffoldChars: 20_000,
        refsChars: 12_000,
        systemContextChars: 48_000,
      };
    case "heavy":
      return {
        scaffoldTokens: 25_000,
        refsTokens: 12_500,
        systemContextTokens: 50_000,
        scaffoldChars: 48_000,
        refsChars: 40_000,
        systemContextChars: 160_000,
      };
    default:
      return {
        scaffoldTokens: 15_000,
        refsTokens: 7_500,
        systemContextTokens: 30_000,
        scaffoldChars: 28_000,
        refsChars: 24_000,
        systemContextChars: 96_000,
      };
  }
}

function deriveReferenceCategories(
  resolvedScaffold: ScaffoldManifest | null,
  routePlan: RoutePlan,
  preGenerationContracts: PreGenerationContractContext,
): string[] {
  const categories = new Set<string>();

  switch (resolvedScaffold?.id) {
    case "base-nextjs":
      categories.add("starter");
      break;
    case "landing-page":
    case "content-site":
      categories.add("marketing-sites");
      break;
    case "saas-landing":
      categories.add("saas");
      categories.add("marketing-sites");
      break;
    case "portfolio":
      categories.add("portfolio");
      break;
    case "blog":
      categories.add("blog");
      break;
    case "dashboard":
    case "app-shell":
      categories.add("admin-dashboard");
      break;
    case "auth-pages":
      categories.add("authentication");
      break;
    case "ecommerce":
      categories.add("ecommerce");
      break;
    default:
      break;
  }

  if (routePlan.routes.some((route) => route.path.startsWith("/docs"))) {
    categories.add("documentation");
  }

  if (
    preGenerationContracts.contracts.integrations.length > 0 ||
    preGenerationContracts.contracts.dataMode === "persisted"
  ) {
    categories.add("backend");
  }

  return Array.from(categories);
}

function deriveForbiddenPatterns(params: {
  buildIntent: BuildIntent;
  generationMode: BuildSpecGenerationMode;
  changeScope: BuildSpecChangeScope;
  previewPolicy: BuildSpecPreviewPolicy;
}): string[] {
  const { buildIntent, generationMode, changeScope, previewPolicy } = params;
  const patterns = new Set<string>([
    "leave_bracket_placeholders",
    "compat_preview_primary",
  ]);

  if (buildIntent !== "app") {
    patterns.add("unrequested_app_shell");
  }
  if (generationMode === "followUp" && changeScope !== "redesign") {
    patterns.add("unrequested_full_redesign");
  }
  if (previewPolicy === "fidelity2") {
    patterns.add("require_full_build_verification");
  }
  if (changeScope === "copy") {
    patterns.add("layout_reset_for_copy_change");
  }

  return Array.from(patterns);
}

export function isBuildSpecEnabled(): boolean {
  return FEATURES.useBuildSpec;
}

export function deriveBuildSpec(params: DeriveBuildSpecParams): BuildSpec {
  const {
    prompt,
    buildIntent,
    generationMode,
    resolvedScaffold,
    routePlan,
    preGenerationContracts,
    promptStrategyMeta = null,
    capabilities = null,
  } = params;

  const capabilityHeavy = capabilities ? hasHeavyCapabilities(capabilities) : false;
  const routeRealization = deriveRouteRealizationPolicy({
    generationMode,
    buildIntent,
    prompt,
    routePlan,
  });

  const changeScope = inferChangeScope({
    prompt,
    generationMode,
    routePlan,
    preGenerationContracts,
  });
  const qualityTarget = inferQualityTarget({
    prompt,
    buildIntent,
    generationMode,
    resolvedScaffold,
    routePlan,
    routeRealization,
    preGenerationContracts,
  });
  const previewPolicy = inferPreviewPolicy({
    prompt,
    generationMode,
    qualityTarget,
    routePlan,
    routeRealization,
    preGenerationContracts,
    buildIntent,
  });
  const verificationPolicy = inferVerificationPolicy({
    generationMode,
    changeScope,
    previewPolicy,
    capabilityHeavy,
  });
  const contextPolicy = inferContextPolicy({
    prompt,
    generationMode,
    changeScope,
    buildIntent,
    routePlan,
    routeRealization,
    preGenerationContracts,
    promptStrategyMeta,
    capabilityHeavy,
  });

  return {
    buildIntent,
    generationMode,
    changeScope,
    scaffoldId: resolvedScaffold?.id ?? null,
    routePlanSummary: buildRoutePlanSummary(routePlan),
    stylePack: inferStylePack(prompt, buildIntent, resolvedScaffold, changeScope),
    qualityTarget,
    previewPolicy,
    verificationPolicy,
    contextPolicy,
    referenceCategories: deriveReferenceCategories(
      resolvedScaffold,
      routePlan,
      preGenerationContracts,
    ),
    forbiddenPatterns: deriveForbiddenPatterns({
      buildIntent,
      generationMode,
      changeScope,
      previewPolicy,
    }),
    tokenBudgets: tokenBudgetsForContextPolicy(contextPolicy),
    routeRealization,
  };
}
