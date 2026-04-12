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
import type { ScaffoldFamily, ScaffoldManifest } from "./scaffolds/types";

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

export interface BuildSpec {
  buildIntent: BuildIntent;
  generationMode: BuildSpecGenerationMode;
  changeScope: BuildSpecChangeScope;
  scaffoldFamily: ScaffoldFamily | null;
  routePlanSummary: string;
  stylePack: string;
  qualityTarget: BuildSpecQualityTarget;
  previewPolicy: BuildSpecPreviewPolicy;
  verificationPolicy: BuildSpecVerificationPolicy;
  contextPolicy: BuildSpecContextPolicy;
  referenceCategories: string[];
  forbiddenPatterns: string[];
  tokenBudgets: BuildSpecTokenBudgets;
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
  if (resolvedScaffold?.family === "blog") return "editorial";
  if (resolvedScaffold?.family === "ecommerce") return "commerce";
  if (resolvedScaffold?.family === "saas-landing") return "saas";
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
  resolvedScaffold: ScaffoldManifest | null;
  routePlan: RoutePlan;
  preGenerationContracts: PreGenerationContractContext;
}): BuildSpecQualityTarget {
  const { prompt, buildIntent, resolvedScaffold, routePlan, preGenerationContracts } = params;
  if (includesAny(RELEASE_CANDIDATE_PATTERNS, prompt)) return "release-candidate";

  const advancedScaffoldFamily =
    resolvedScaffold?.family === "dashboard" ||
    resolvedScaffold?.family === "ecommerce" ||
    resolvedScaffold?.family === "app-shell" ||
    resolvedScaffold?.family === "saas-landing";
  const routeCount = routePlan.routes.length;
  const premiumSignals =
    buildIntent === "app" ||
    routeCount > 4 ||
    routePlan.siteType === "content-heavy" ||
    (routePlan.provenance.primarySource === "scaffold" && routeCount >= 3) ||
    preGenerationContracts.contracts.integrations.length > 0 ||
    preGenerationContracts.contracts.dataMode === "persisted" ||
    advancedScaffoldFamily;

  return premiumSignals ? "premium" : "standard";
}

function inferPreviewPolicy(params: {
  prompt: string;
  qualityTarget: BuildSpecQualityTarget;
  routePlan: RoutePlan;
  preGenerationContracts: PreGenerationContractContext;
  buildIntent: BuildIntent;
}): BuildSpecPreviewPolicy {
  const { prompt, qualityTarget, routePlan, preGenerationContracts, buildIntent } = params;
  if (qualityTarget === "release-candidate") return "fidelity3";
  if (
    buildIntent === "app" &&
    (preGenerationContracts.contracts.integrations.length > 1 || routePlan.routes.length > 4)
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
  return (
    trimmedPrompt.length <= 220 &&
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
  preGenerationContracts: PreGenerationContractContext;
  promptStrategyMeta?: Pick<PromptStrategyMeta, "strategy" | "promptType"> | null;
  capabilityHeavy: boolean;
}): BuildSpecContextPolicy {
  const { prompt, generationMode, changeScope, buildIntent, routePlan, preGenerationContracts, promptStrategyMeta, capabilityHeavy } = params;
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
    routePlan.siteType === "content-heavy" ||
    routePlan.siteType === "app-shell" ||
    (routePlan.provenance.primarySource === "scaffold" && routePlan.routes.length >= 3);

  if (
    promptStrategyMeta?.strategy === "phase_plan_build_refine" ||
    promptStrategyMeta?.strategy === "preserved" ||
    buildIntent === "app" ||
    routePlan.routes.length > 4 ||
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
        scaffoldTokens: 5_600,
        refsTokens: 1_900,
        systemContextTokens: 15_000,
        scaffoldChars: 18_000,
        refsChars: 6_000,
        systemContextChars: 48_000,
      };
    case "heavy":
      return {
        scaffoldTokens: 18_750,
        refsTokens: 6_250,
        systemContextTokens: 50_000,
        scaffoldChars: 60_000,
        refsChars: 20_000,
        systemContextChars: 160_000,
      };
    default:
      return {
        scaffoldTokens: 11_250,
        refsTokens: 3_750,
        systemContextTokens: 30_000,
        scaffoldChars: 36_000,
        refsChars: 12_000,
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

  switch (resolvedScaffold?.family) {
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

  const changeScope = inferChangeScope({
    prompt,
    generationMode,
    routePlan,
    preGenerationContracts,
  });
  const qualityTarget = inferQualityTarget({
    prompt,
    buildIntent,
    resolvedScaffold,
    routePlan,
    preGenerationContracts,
  });
  const previewPolicy = inferPreviewPolicy({
    prompt,
    qualityTarget,
    routePlan,
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
    preGenerationContracts,
    promptStrategyMeta,
    capabilityHeavy,
  });

  return {
    buildIntent,
    generationMode,
    changeScope,
    scaffoldFamily: resolvedScaffold?.family ?? null,
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
  };
}
