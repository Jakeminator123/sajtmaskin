/**
 * Scaffold matching — selects the best internal scaffold for a prompt
 * using embedding-based semantic search, filtered by buildIntent.
 *
 * Falls back to a deterministic default when embeddings are unavailable
 * (missing API key or empty embeddings file) or when no intent-compatible
 * candidate scores above the similarity threshold.
 */
import type { ScaffoldManifest } from "./types";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { getAllScaffolds, getScaffoldByFamily, getScaffoldById } from "./registry";
import type { ScaffoldSearchResult } from "./scaffold-search";
import { searchScaffolds } from "./scaffold-search";

const EMBEDDING_MIN_SCORE = 0.35;
const KEYWORD_ONLY_MIN_BOOST = 0.14;
const DEFAULT_WEBSITE_SCAFFOLD = "content-site";
const DEFAULT_APP_SCAFFOLD = "app-shell";
const ULTIMATE_FALLBACK_SCAFFOLD = "base-nextjs";

export interface ScaffoldMatchMeta {
  matchSource: "embedding" | "heuristic" | "manual" | "persisted" | "off" | "fallback";
  embeddingScore: number | null;
  embeddingRunnerUpId: string | null;
}

const DASHBOARD_KEYWORDS = [
  "dashboard",
  "admin",
  "adminpanel",
  "analytics",
  "metric",
  "metrics",
  "kpi",
  "stats",
  "statistik",
  "rapport",
  "rapporter",
  "kontrollpanel",
] as const;

const APP_SHELL_KEYWORDS = [
  "app",
  "portal",
  "workspace",
  "verktyg",
  "tool",
  "konto",
  "login",
  "logga in",
  "bokning",
  "crm",
  "workflow",
  "arbetsflöde",
  "interaktiv",
  "interactive",
] as const;

const AUTH_KEYWORDS = [
  "login",
  "sign in",
  "sign-in",
  "register",
  "registrera",
  "auth",
  "autentisering",
  "konto",
] as const;

const ECOMMERCE_KEYWORDS = [
  "shop",
  "store",
  "webshop",
  "e-handel",
  "checkout",
  "cart",
  "produkt",
  "product",
  "butik",
  "buy",
  "köp",
] as const;

const BLOG_KEYWORDS = [
  "blog",
  "artikel",
  "article",
  "news",
  "nyheter",
  "post",
  "editorial",
  "content hub",
  "magazine",
] as const;

const PORTFOLIO_KEYWORDS = [
  "portfolio",
  "case study",
  "case studies",
  "showcase",
  "fotograf",
  "photographer",
  "creative studio",
  "agency portfolio",
] as const;

const SAAS_KEYWORDS = [
  "saas",
  "pricing",
  "waitlist",
  "product launch",
  "launch",
  "startup",
  "features",
  "free trial",
] as const;

const GAME_KEYWORDS = [
  "spel",
  "game",
  "gaming",
  "arcade",
  "pac man",
  "pacman",
  "retro",
  "pixel",
  "tv spel",
  "spelhall",
] as const;

const IMMERSIVE_VISUAL_KEYWORDS = [
  "3d",
  "3-d",
  "animation",
  "animationer",
  "animerad",
  "animated",
  "futuristic",
  "neon",
  "glow",
  "floating",
  "parallax",
  "spacat",
  "spacy",
  "cyberpunk",
] as const;

function normalizePrompt(prompt: string): string {
  return ` ${prompt
    .toLowerCase()
    .replace(/[^a-z0-9åäö]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function countKeywordHits(normalizedPrompt: string, keywords: readonly string[]): number {
  return keywords.reduce(
    (count, keyword) => count + (normalizedPrompt.includes(` ${keyword.toLowerCase()} `) ? 1 : 0),
    0,
  );
}

function websiteIntentCanUseAppScaffolds(normalizedPrompt: string): boolean {
  const dashboardHits = countKeywordHits(normalizedPrompt, DASHBOARD_KEYWORDS);
  const appHits = countKeywordHits(normalizedPrompt, APP_SHELL_KEYWORDS);
  return dashboardHits >= 2 || appHits >= 2;
}

function determineFallback(buildIntent?: BuildIntent | null): ScaffoldManifest | null {
  if (buildIntent === "app") return getScaffoldByFamily(DEFAULT_APP_SCAFFOLD);
  if (buildIntent === "website" || buildIntent === "template") return getScaffoldById(DEFAULT_WEBSITE_SCAFFOLD);
  return getScaffoldByFamily(ULTIMATE_FALLBACK_SCAFFOLD);
}

function isIntentCompatible(
  scaffold: ScaffoldManifest,
  intent: BuildIntent | null | undefined,
  normalizedPrompt: string,
): boolean {
  if (!intent) return true;
  const allowed = scaffold.buildIntents;
  if (allowed.includes(intent as typeof allowed[number])) return true;
  if (intent === "template" && allowed.includes("website")) return true;
  if (intent === "website" && allowed.includes("template")) return true;
  if (
    intent === "website" &&
    allowed.includes("app") &&
    websiteIntentCanUseAppScaffolds(normalizedPrompt)
  ) {
    return true;
  }
  return false;
}

function computeKeywordBoost(normalizedPrompt: string, scaffoldId: string): number {
  const dashboardHits = countKeywordHits(normalizedPrompt, DASHBOARD_KEYWORDS);
  const appHits = countKeywordHits(normalizedPrompt, APP_SHELL_KEYWORDS);
  const authHits = countKeywordHits(normalizedPrompt, AUTH_KEYWORDS);
  const ecommerceHits = countKeywordHits(normalizedPrompt, ECOMMERCE_KEYWORDS);
  const blogHits = countKeywordHits(normalizedPrompt, BLOG_KEYWORDS);
  const portfolioHits = countKeywordHits(normalizedPrompt, PORTFOLIO_KEYWORDS);
  const saasHits = countKeywordHits(normalizedPrompt, SAAS_KEYWORDS);
  const gameHits = countKeywordHits(normalizedPrompt, GAME_KEYWORDS);
  const immersiveHits = countKeywordHits(normalizedPrompt, IMMERSIVE_VISUAL_KEYWORDS);

  switch (scaffoldId) {
    case "dashboard":
      return dashboardHits >= 2 ? 0.18 : 0;
    case "app-shell":
      return appHits >= 2 ? 0.16 : 0;
    case "auth-pages":
      return authHits >= 2 ? 0.18 : 0;
    case "ecommerce":
      return ecommerceHits >= 2 ? 0.18 : 0;
    case "blog":
      return blogHits >= 2 ? 0.16 : 0;
    case "portfolio":
      return portfolioHits >= 2 ? 0.15 : 0;
    case "saas-landing":
      return saasHits >= 2 ? 0.14 : 0;
    case "base-nextjs":
      if (gameHits >= 1 && immersiveHits >= 2) return 0.18;
      if (immersiveHits >= 4) return 0.12;
      return 0;
    case "content-site":
      if ((gameHits >= 1 && immersiveHits >= 2) || dashboardHits >= 2 || appHits >= 2) {
        return -0.08;
      }
      return 0;
    default:
      return 0;
  }
}

function rankCandidates(
  candidates: ScaffoldSearchResult[],
  buildIntent: BuildIntent | null | undefined,
  normalizedPrompt: string,
) {
  return candidates
    .filter((candidate) => isIntentCompatible(candidate.scaffold, buildIntent, normalizedPrompt))
    .map((candidate) => {
      const keywordBoost = computeKeywordBoost(normalizedPrompt, candidate.scaffold.id);
      return {
        ...candidate,
        keywordBoost,
        effectiveScore: candidate.score + keywordBoost,
      };
    })
    .sort((a, b) => {
      if (b.effectiveScore !== a.effectiveScore) return b.effectiveScore - a.effectiveScore;
      return b.score - a.score;
    });
}

function getKeywordOnlyCandidate(
  buildIntent: BuildIntent | null | undefined,
  normalizedPrompt: string,
): ScaffoldManifest | null {
  const ranked = getAllScaffolds()
    .filter((scaffold) => isIntentCompatible(scaffold, buildIntent, normalizedPrompt))
    .map((scaffold) => ({
      scaffold,
      keywordBoost: computeKeywordBoost(normalizedPrompt, scaffold.id),
    }))
    .filter((candidate) => candidate.keywordBoost >= KEYWORD_ONLY_MIN_BOOST)
    .sort((a, b) => b.keywordBoost - a.keywordBoost);

  return ranked[0]?.scaffold ?? null;
}

/**
 * Async scaffold matching using semantic embedding search.
 *
 * Embedding candidates are filtered by `buildIntents` so a website-only
 * scaffold cannot win when the user asks for an app. Returns the best
 * intent-compatible match above the similarity threshold, or a deterministic
 * fallback based on buildIntent.
 */
export async function matchScaffoldWithEmbeddings(
  prompt: string,
  buildIntent?: BuildIntent | null,
): Promise<{ scaffold: ScaffoldManifest | null; matchMeta: ScaffoldMatchMeta }> {
  const fallback = determineFallback(buildIntent);
  const normalizedPrompt = normalizePrompt(prompt);

  try {
    const results = await searchScaffolds(prompt, getAllScaffolds().length);
    const compatible = rankCandidates(results, buildIntent, normalizedPrompt);

    if (compatible.length > 0 && compatible[0].effectiveScore >= EMBEDDING_MIN_SCORE) {
      const best = compatible[0];
      const runnerUp = compatible.length > 1 ? compatible[1] : null;
      return {
        scaffold: best.scaffold,
        matchMeta: {
          matchSource: best.keywordBoost !== 0 ? "heuristic" : "embedding",
          embeddingScore: Math.round(best.score * 1000) / 1000,
          embeddingRunnerUpId: runnerUp?.scaffold.id ?? null,
        },
      };
    }
  } catch {
    // Embedding search is best-effort; fall through to deterministic fallback.
  }

  const keywordOnly = getKeywordOnlyCandidate(buildIntent, normalizedPrompt);
  if (keywordOnly) {
    return {
      scaffold: keywordOnly,
      matchMeta: { matchSource: "heuristic", embeddingScore: null, embeddingRunnerUpId: null },
    };
  }

  return {
    scaffold: fallback,
    matchMeta: { matchSource: "fallback", embeddingScore: null, embeddingRunnerUpId: null },
  };
}
