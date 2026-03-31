import type { BuildIntent } from "@/lib/builder/build-intent";
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";
import { FEATURES } from "@/lib/config";
import type { PreGenerationContractContext } from "./pre-generation-contracts";
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

export interface BuildSpecTokenBudgets {
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
};

const RELEASE_CANDIDATE_PATTERNS = [
  /\brelease candidate\b/i,
  /\bdeploy[- ]ready\b/i,
  /\bready for production\b/i,
  /\bprod(?:uction)?[- ]ready\b/i,
  /\blaunch\b/i,
];

const REDESIGN_PATTERNS = [
  /\bredesign\b/i,
  /\brebrand\b/i,
  /\brestyle\b/i,
  /\bstart over\b/i,
  /\bfrom scratch\b/i,
  /\bhelt ny riktning\b/i,
  /\bgör om från grunden\b/i,
];

const COPY_PATTERNS = [
  /\bcopy\b/i,
  /\btext\b/i,
  /\binnehåll\b/i,
  /\bcontent\b/i,
  /\bheadline\b/i,
  /\btagline\b/i,
  /\bseo\b/i,
  /\bmeta\b/i,
  /\bwording\b/i,
];

const COPY_GUARD_PATTERNS = [
  /\bbehåll(?:er)?\b.*\bdesign(?:en)?\b/i,
  /\bbehåll(?:er)?\b.*\blayout(?:en)?\b/i,
  /\bkeep\b.*\bdesign\b/i,
  /\bkeep\b.*\blayout\b/i,
  /\bwithout changing\b.*\bdesign\b/i,
  /\bwithout changing\b.*\blayout\b/i,
];

const LAYOUT_PATTERNS = [
  /\blayout\b/i,
  /\bspacing\b/i,
  /\bfärg\b/i,
  /\bcolor\b/i,
  /\bpalette\b/i,
  /\bhero\b/i,
  /\bfooter\b/i,
  /\bheader\b/i,
  /\banimation\b/i,
  /\bmotion\b/i,
  /\bdesign\b/i,
  /\bvisual\b/i,
];

const PAGE_ADDITION_PATTERNS = [
  /\bnew page\b/i,
  /\blägg till sida\b/i,
  /\bny sida\b/i,
  /\broute\b/i,
  /\bpricing\b/i,
  /\bblog\b/i,
  /\bkontakt\b/i,
  /\bcontact\b/i,
  /\babout\b/i,
  /\bservices\b/i,
  /\bproducts\b/i,
];

const INTEGRATION_PATTERNS = [
  /\bintegration\b/i,
  /\bapi\b/i,
  /\bdatabase\b/i,
  /\bdatabas\b/i,
  /\bauth\b/i,
  /\bstripe\b/i,
  /\bsupabase\b/i,
  /\bprisma\b/i,
  /\bdrizzle\b/i,
  /\bclerk\b/i,
  /\bnextauth\b/i,
  /\bauth0\b/i,
  /\bopenai\b/i,
  /\bresend\b/i,
  /\bredis\b/i,
  /\bupstash\b/i,
];

function includesAny(patterns: RegExp[], value: string): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function buildRoutePlanSummary(routePlan: RoutePlan): string {
  const routes = routePlan.routes
    .slice(0, 8)
    .map((route) => route.path)
    .join(",");
  return `${routePlan.source}:${routePlan.siteType}:${routes || "/"}`;
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

  const premiumSignals =
    buildIntent === "app" ||
    routePlan.routes.length > 1 ||
    preGenerationContracts.contracts.integrations.length > 0 ||
    preGenerationContracts.contracts.dataMode === "persisted" ||
    resolvedScaffold?.family === "dashboard" ||
    resolvedScaffold?.family === "ecommerce" ||
    resolvedScaffold?.family === "app-shell" ||
    resolvedScaffold?.family === "saas-landing";

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
}): BuildSpecVerificationPolicy {
  const { generationMode, changeScope, previewPolicy } = params;
  if (previewPolicy === "fidelity3") return "strict";
  if (generationMode === "followUp" && (changeScope === "copy" || changeScope === "local-layout")) {
    return "fast";
  }
  return "standard";
}

function inferContextPolicy(params: {
  generationMode: BuildSpecGenerationMode;
  changeScope: BuildSpecChangeScope;
  buildIntent: BuildIntent;
  routePlan: RoutePlan;
  preGenerationContracts: PreGenerationContractContext;
  promptStrategyMeta?: Pick<PromptStrategyMeta, "strategy" | "promptType"> | null;
}): BuildSpecContextPolicy {
  const { generationMode, changeScope, buildIntent, routePlan, preGenerationContracts, promptStrategyMeta } = params;
  if (generationMode === "followUp" && (changeScope === "copy" || changeScope === "local-layout")) {
    return "light";
  }
  if (
    promptStrategyMeta?.strategy === "phase_plan_build_polish" ||
    buildIntent === "app" ||
    routePlan.routes.length > 4 ||
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
        scaffoldChars: 12_000,
        refsChars: 4_000,
        systemContextChars: 18_000,
      };
    case "heavy":
      return {
        scaffoldChars: 25_000,
        refsChars: 12_000,
        systemContextChars: 36_000,
      };
    default:
      return {
        scaffoldChars: 20_000,
        refsChars: 8_000,
        systemContextChars: 28_000,
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
    "tier1_static_preview_primary",
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
  } = params;

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
  });
  const contextPolicy = inferContextPolicy({
    generationMode,
    changeScope,
    buildIntent,
    routePlan,
    preGenerationContracts,
    promptStrategyMeta,
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
