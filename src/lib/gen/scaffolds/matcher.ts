/**
 * Scaffold matching — selects the best internal scaffold for a prompt.
 *
 * Keyword scores and embedding similarity are both computed for auto mode:
 * embedding search starts immediately (parallel wall-clock with sync keyword
 * scoring), then the stronger signal wins for non-generic keyword picks.
 * Embeddings still override generic defaults (`landing-page` / `base-nextjs`)
 * when similarity clears the floor and safety guards pass.
 *
 * `SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH=off` skips keyword *selection* (defaults
 * to intent baseline) so experiments can lean on embeddings + brief.
 *
 * Only matches against internal scaffolds in registry.ts.
 */
import type { ScaffoldManifest } from "./types";
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { InferredCapabilities } from "@/lib/gen/capability-inference";
import { getScaffoldByFamily, getScaffoldById } from "./registry";
import {
  searchScaffoldsWithDiagnostics,
  type ScaffoldSearchResponse,
} from "./scaffold-search";
const LANDING_KEYWORDS = [
  "landing",
  "marketing",
  "campaign",
  "company",
  "business",
  "services",
  "service",
  "consulting",
  "consultant",
  "studio",
  "agency",
  "corporate",
  "startup",
  "brand",
  "homepage",
  "home page",
  "hemsida",
  "webbplats",
  "sajt",
  "företag",
  "byrå",
  "tjänster",
  "kampanj",
];

const SAAS_KEYWORDS = [
  "saas",
  "software",
  "platform",
  "subscription",
  "pricing",
  "billing",
  "product-led",
  "product led",
  "b2b",
  "workspace",
  "dashboard preview",
  "free trial",
  "mjukvara",
  "plattform",
  "abonnemang",
  "pris",
  "testperiod",
];

const PORTFOLIO_KEYWORDS = [
  "portfolio",
  "designer",
  "developer",
  "photographer",
  "photo studio",
  "creative",
  "creator",
  "personal",
  "resume",
  "cv",
  "selected work",
  "case study",
  "case studies",
  "founder profile",
  "artist",
  "stylist",
  "copywriter",
  "consultant profile",
  "illustrator",
  "videographer",
  "portfolio site",
  "fotograf",
  "fotostudio",
  "kreatör",
  "personlig",
  "case",
];

const PORTFOLIO_MEDIA_KEYWORDS = [
  "photo",
  "photos",
  "image",
  "images",
  "foto",
  "foton",
  "bild",
  "bilder",
  "fotografi",
  "fotografier",
  "photography",
];

const PORTFOLIO_ART_DIRECTION_KEYWORDS = [
  "gallery",
  "galleri",
  "editorial",
  "utställning",
  "exhibition",
  "visuell",
  "visual",
  "estetisk",
  "harmonisk",
  "poetisk",
  "curated",
  "kurerad",
];

const BLOG_KEYWORDS = [
  "blog",
  "blogg",
  "article",
  "artikel",
  "post",
  "inlägg",
  "writer",
  "författare",
  "newsletter",
  "magazine",
  "magasin",
  "editorial",
  "redaktion",
  "content",
  "innehåll",
  "reading",
  "läsa",
];

const DASHBOARD_KEYWORDS = [
  "dashboard",
  "instrumentpanel",
  "analytics",
  "analys",
  "stats",
  "statistik",
  "metrics",
  "mätvärden",
  "overview",
  "översikt",
  "reports",
  "rapport",
  "rapporter",
  "chart",
  "diagram",
  "table",
  "tabell",
  "kontrollpanel",
  "nyckeltal",
  "graf",
  "grafer",
  "sammanställning",
];

const APP_KEYWORDS = [
  "admin",
  "crm",
  "panel",
  "settings",
  "inställningar",
  "users",
  "användare",
  "sidebar",
  "sidopanel",
  "tool",
  "verktyg",
  "management",
  "monitor",
  "application",
  "app",
  "workspace",
  "portal",
  "backoffice",
  "administrera",
  "hantera",
  "kontoinställningar",
  "kontohantering",
  "systemvy",
  "översiktsvy",
];

const AUTH_KEYWORDS = [
  "auth",
  "login",
  "inloggning",
  "logga in",
  "signup",
  "sign up",
  "registrera",
  "registrering",
  "register",
  "password",
  "lösenord",
  "forgot password",
  "glömt lösenord",
  "reset password",
  "återställ",
  "autentisering",
  "konto",
  "skapa konto",
  "verifiera",
  "verifiering",
  "tvåfaktor",
];

const ECOMMERCE_KEYWORDS = [
  "ecommerce",
  "e-commerce",
  "e-handel",
  "webshop",
  "webbshop",
  "shop",
  "butik",
  "store",
  "online store",
  "nätbutik",
  "product",
  "produkt",
  "produkter",
  "cart",
  "varukorg",
  "kundvagn",
  "checkout",
  "kassa",
  "betalning",
  "order",
  "beställning",
  "inventory",
  "lager",
  "catalog",
  "katalog",
  "storefront",
];


const CONTENT_KEYWORDS = [
  "content",
  "innehåll",
  "gallery",
  "galleri",
  "showcase",
  "work",
  "projekt",
  "projects",
  "stories",
  "landing",
  "marketing",
  "startup",
  "company",
  "business",
  "brand",
  "hemsida",
  "webbplats",
  "sajt",
  "företag",
  "byrå",
  "fotograf",
  "saas",
  "software",
  "pricing",
  "subscription",
  "tier",
  "feature",
  "product",
  "service",
  "solution",
  "plattform",
  "tjänst",
  "mjukvara",
  "pris",
  "abonnemang",
];

/**
 * Domain keywords that indicate the site is a service/hospitality business,
 * NOT an online store. When these are present and ecommerce intent is weak,
 * the ecommerce scaffold should be vetoed in favor of landing-page or content-site.
 */
const HOSPITALITY_SERVICE_KEYWORDS = [
  "restaurang",
  "restaurant",
  "café",
  "cafe",
  "kafé",
  "bistro",
  "bar",
  "pub",
  "bakeri",
  "bageri",
  "bakery",
  "konditori",
  "pizzeria",
  "hotell",
  "hotel",
  "hostel",
  "bed and breakfast",
  "b&b",
  "spa",
  "salong",
  "salon",
  "frisör",
  "barber",
  "tandläkare",
  "dentist",
  "clinic",
  "klinik",
  "veterinär",
  "gym",
  "yoga",
  "pilates",
  "massage",
  "terapeut",
  "therapist",
  "catering",
  "food truck",
  "matrestaurang",
  "meny",
  "menu",
  "boka bord",
  "book a table",
  "reservation",
  "öppettider",
  "opening hours",
];

/**
 * Strong ecommerce-intent keywords that override the hospitality veto.
 * Only if these appear alongside hospitality words should ecommerce still win.
 */
const STRONG_ECOMMERCE_INTENT = [
  "webshop",
  "webbshop",
  "e-handel",
  "ecommerce",
  "e-commerce",
  "varukorg",
  "kundvagn",
  "cart",
  "checkout",
  "kassa",
  "storefront",
  "nätbutik",
  "online store",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countKeywordMatches(text: string, keywords: readonly string[]): number {
  return keywords.reduce((count, keyword) => {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegex(keyword)}([^\\p{L}\\p{N}]|$)`,
      "iu",
    );
    return count + (pattern.test(text) ? 1 : 0);
  }, 0);
}

function countPortfolioSignalBoost(text: string): number {
  const creatorScore = countKeywordMatches(text, PORTFOLIO_KEYWORDS);
  const mediaScore = countKeywordMatches(text, PORTFOLIO_MEDIA_KEYWORDS);
  const artDirectionScore = countKeywordMatches(text, PORTFOLIO_ART_DIRECTION_KEYWORDS);

  let boost = 0;
  if (creatorScore > 0 && mediaScore > 0) boost += 2;
  if (creatorScore > 0 && artDirectionScore > 0) boost += 1;
  if (mediaScore > 0 && artDirectionScore > 0) boost += 1;
  return boost;
}

/** Minimum score to prefer a specific scaffold over fallbacks */
const MIN_SCORE = 2;

export type ScaffoldSelectionMethod =
  | "off"
  | "manual"
  | "persisted"
  | "keyword"
  | "embedding"
  | "default";

export type ScaffoldSelectionConfidence = "high" | "medium" | "low";

export interface ScaffoldSelectionMeta {
  selectedScaffold: string | null;
  selectionMethod: ScaffoldSelectionMethod;
  selectionConfidence: ScaffoldSelectionConfidence;
  topCandidates: Array<{ id: string; score: number; source: "keyword" | "embedding" }>;
  keywordScores: Record<string, number>;
  embeddingAvailable: boolean;
  embeddingFailed: boolean;
  embeddingTopResult: { id: string; score: number } | null;
  semanticUnavailableReason: string | null;
  embeddingOverrideReason: string | null;
  briefContextApplied: boolean;
}

export interface ScaffoldSelectionResult {
  scaffold: ScaffoldManifest | null;
  meta: ScaffoldSelectionMeta;
}

export interface ScaffoldQueryContext {
  briefPages?: Array<{ name?: string; path?: string; purpose?: string }>;
  styleKeywords?: string[];
  domainHints?: string[];
}

function sortScoresDesc<T extends { score: number }>(scores: T[]): T[] {
  return [...scores].sort((a, b) => b.score - a.score);
}

function buildKeywordScores(
  promptLower: string,
  capabilities?: InferredCapabilities,
): Array<{ id: string; score: number }> {
  const authScore = countKeywordMatches(promptLower, AUTH_KEYWORDS);
  let ecommerceScore = countKeywordMatches(promptLower, ECOMMERCE_KEYWORDS);
  const dashboardScore = countKeywordMatches(promptLower, DASHBOARD_KEYWORDS);
  const appScore = countKeywordMatches(promptLower, APP_KEYWORDS);
  const saasScore = countKeywordMatches(promptLower, SAAS_KEYWORDS);
  const portfolioScore =
    countKeywordMatches(promptLower, PORTFOLIO_KEYWORDS) + countPortfolioSignalBoost(promptLower);
  const landingScore = countKeywordMatches(promptLower, LANDING_KEYWORDS);
  const blogScore = countKeywordMatches(promptLower, BLOG_KEYWORDS);
  const contentScore = countKeywordMatches(promptLower, CONTENT_KEYWORDS);

  const hospitalityScore = countKeywordMatches(promptLower, HOSPITALITY_SERVICE_KEYWORDS);
  const strongEcommerceScore = countKeywordMatches(promptLower, STRONG_ECOMMERCE_INTENT);
  if (hospitalityScore > 0 && strongEcommerceScore === 0) {
    ecommerceScore = 0;
  }

  const scores = [
    { id: "auth-pages", score: authScore },
    { id: "ecommerce", score: ecommerceScore },
    { id: "dashboard", score: dashboardScore },
    { id: "app-shell", score: appScore },
    { id: "saas-landing", score: saasScore },
    { id: "portfolio", score: portfolioScore },
    { id: "landing-page", score: landingScore },
    { id: "blog", score: blogScore },
    { id: "content-site", score: contentScore },
    { id: "base-nextjs", score: 0 },
  ];

  if (capabilities) {
    const boost = (id: string, amount: number) => {
      const entry = scores.find((s) => s.id === id);
      if (entry) entry.score += amount;
    };
    if (capabilities.needsDataUI) boost("dashboard", 2);
    if (capabilities.needsCharts) boost("dashboard", 2);
    if (capabilities.needsAppShell) boost("app-shell", 2);
    if (capabilities.needsAuth) boost("auth-pages", 2);
    if (capabilities.needsEcommerce) boost("ecommerce", 2);
  }

  return scores;
}

function applyBriefKeywordBoost(
  scores: Array<{ id: string; score: number }>,
  context: ScaffoldQueryContext | undefined,
): Array<{ id: string; score: number }> {
  if (!context) return scores;
  const briefPages = context.briefPages ?? [];
  const styleKeywords = context.styleKeywords ?? [];
  const domainHints = context.domainHints ?? [];
  const combinedText = [
    ...briefPages.map((page) => `${page.name ?? ""} ${page.path ?? ""} ${page.purpose ?? ""}`),
    ...styleKeywords,
    ...domainHints,
  ]
    .join(" ")
    .toLowerCase();
  if (!combinedText.trim()) return scores;

  const boosts = new Map<string, number>();
  const addBoost = (id: string, amount: number) => boosts.set(id, (boosts.get(id) ?? 0) + amount);

  if (countKeywordMatches(combinedText, AUTH_KEYWORDS) > 0) addBoost("auth-pages", 2);
  if (countKeywordMatches(combinedText, ECOMMERCE_KEYWORDS) > 0) addBoost("ecommerce", 2);
  if (countKeywordMatches(combinedText, DASHBOARD_KEYWORDS) > 0) addBoost("dashboard", 2);
  if (countKeywordMatches(combinedText, APP_KEYWORDS) > 0) addBoost("app-shell", 2);
  if (countKeywordMatches(combinedText, BLOG_KEYWORDS) > 0) addBoost("blog", 2);
  if (countKeywordMatches(combinedText, PORTFOLIO_KEYWORDS) > 0) addBoost("portfolio", 2);
  if (countKeywordMatches(combinedText, SAAS_KEYWORDS) > 0) addBoost("saas-landing", 2);

  if (boosts.size === 0) return scores;
  return scores.map((entry) => ({
    ...entry,
    score: entry.score + (boosts.get(entry.id) ?? 0),
  }));
}

function buildScaffoldPrompt(prompt: string, context: ScaffoldQueryContext | undefined): string {
  if (!context) return prompt;
  const fragments: string[] = [];
  if (context.briefPages && context.briefPages.length > 0) {
    const pageSummary = context.briefPages
      .map((page) => `${page.name ?? ""} ${page.path ?? ""} ${page.purpose ?? ""}`.trim())
      .filter(Boolean)
      .join(" | ");
    if (pageSummary) fragments.push(`Brief pages: ${pageSummary}`);
  }
  if (context.styleKeywords && context.styleKeywords.length > 0) {
    fragments.push(`Style keywords: ${context.styleKeywords.join(", ")}`);
  }
  if (context.domainHints && context.domainHints.length > 0) {
    fragments.push(`Domain hints: ${context.domainHints.join(", ")}`);
  }
  if (fragments.length === 0) return prompt;
  return `${prompt}\n\n${fragments.join("\n")}`;
}

function getTopKeywordCandidates(
  scores: Array<{ id: string; score: number }>,
  selectedScaffoldId: string | null,
): Array<{ id: string; score: number; source: "keyword" }> {
  const sorted = sortScoresDesc(scores).filter((entry) => entry.score > 0);
  if (sorted.length > 0) {
    return sorted.slice(0, 3).map((entry) => ({
      id: entry.id,
      score: normalizedKeywordStrength(entry.score),
      source: "keyword",
    }));
  }
  if (!selectedScaffoldId) return [];
  return [{ id: selectedScaffoldId, score: 0, source: "keyword" }];
}

function keywordScoreRecord(scores: Array<{ id: string; score: number }>): Record<string, number> {
  return Object.fromEntries(scores.map((entry) => [entry.id, entry.score]));
}

function inferKeywordSelectionMethod(params: {
  selectedScaffold: ScaffoldManifest | null;
  maxKeywordScore: number;
}): ScaffoldSelectionMethod {
  const { selectedScaffold, maxKeywordScore } = params;
  if (!selectedScaffold) return "default";
  const isGenericDefault =
    selectedScaffold.id === "landing-page" || selectedScaffold.id === "base-nextjs";
  if (isGenericDefault && maxKeywordScore < MIN_SCORE) {
    return "default";
  }
  return "keyword";
}

function inferKeywordConfidence(maxKeywordScore: number, method: ScaffoldSelectionMethod): ScaffoldSelectionConfidence {
  if (method === "default") return "low";
  if (maxKeywordScore >= MIN_SCORE + 2) return "high";
  return "medium";
}

function capSelectionConfidence(
  current: ScaffoldSelectionConfidence,
  maxAllowed: ScaffoldSelectionConfidence,
): ScaffoldSelectionConfidence {
  const rank: Record<ScaffoldSelectionConfidence, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };
  return rank[current] <= rank[maxAllowed] ? current : maxAllowed;
}

function inferFallbackConfidence(params: {
  selectedScaffold: ScaffoldManifest | null;
  currentConfidence: ScaffoldSelectionConfidence;
  semanticAvailable: boolean;
  semanticUnavailableReason: string | null;
}): ScaffoldSelectionConfidence {
  const {
    selectedScaffold,
    currentConfidence,
    semanticAvailable,
    semanticUnavailableReason,
  } = params;
  const isGenericDefault =
    selectedScaffold?.id === "landing-page" || selectedScaffold?.id === "base-nextjs";
  if (!isGenericDefault) return currentConfidence;
  if (semanticUnavailableReason) return "low";
  if (semanticAvailable) return capSelectionConfidence(currentConfidence, "medium");
  return currentConfidence;
}

function withEmbeddingCandidate(
  candidates: Array<{ id: string; score: number; source: "keyword" | "embedding" }>,
  embeddingTopResult: { id: string; score: number } | null,
): Array<{ id: string; score: number; source: "keyword" | "embedding" }> {
  if (!embeddingTopResult) return candidates;
  if (candidates.some((candidate) => candidate.id === embeddingTopResult.id)) {
    return candidates;
  }
  const withEmbedding = [
    { id: embeddingTopResult.id, score: embeddingTopResult.score, source: "embedding" as const },
    ...candidates,
  ];
  return sortScoresDesc(withEmbedding).slice(0, 3);
}

/** Picks the best scaffold from scored candidates, or null if none meets threshold */
function pickBestScaffold(
  scores: Array<{ id: string; score: number }>,
): ScaffoldManifest | null {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  if (!best || best.score < MIN_SCORE) return null;
  return getScaffoldById(best.id);
}

/**
 * Synchronous keyword-based scaffold matching.
 * Fast and deterministic -- used as the primary matcher.
 */
export function matchScaffold(
  prompt: string,
  buildIntent?: BuildIntent | null,
): ScaffoldManifest | null {
  if (isScaffoldKeywordMatchDisabled()) {
    return defaultScaffoldForIntent(buildIntent);
  }

  const lower = prompt.toLowerCase();

  const authScore = countKeywordMatches(lower, AUTH_KEYWORDS);
  if (authScore >= MIN_SCORE) {
    return getScaffoldByFamily("auth-pages");
  }

  const ecommerceScore = countKeywordMatches(lower, ECOMMERCE_KEYWORDS);
  if (ecommerceScore >= MIN_SCORE) {
    const hospitalityScore = countKeywordMatches(lower, HOSPITALITY_SERVICE_KEYWORDS);
    const strongEcommerceScore = countKeywordMatches(lower, STRONG_ECOMMERCE_INTENT);
    if (hospitalityScore > 0 && strongEcommerceScore === 0) {
      // Domain is hospitality/service — weak ecommerce signals (e.g. "produkt", "meny")
      // are false positives. Fall through to landing-page/content-site matching.
    } else {
      return getScaffoldByFamily("ecommerce");
    }
  }

  if (buildIntent === "app") {
    const dashboardScore = countKeywordMatches(lower, DASHBOARD_KEYWORDS);
    const appScore = countKeywordMatches(lower, APP_KEYWORDS);
    if (dashboardScore >= MIN_SCORE && dashboardScore >= appScore) {
      return getScaffoldByFamily("dashboard");
    }
    return getScaffoldByFamily("app-shell");
  }

  const dashboardScore = countKeywordMatches(lower, DASHBOARD_KEYWORDS);
  const appScore = countKeywordMatches(lower, APP_KEYWORDS);
  if (appScore >= MIN_SCORE || dashboardScore >= MIN_SCORE) {
    if (dashboardScore >= appScore) {
      return getScaffoldByFamily("dashboard");
    }
    return getScaffoldByFamily("app-shell");
  }

  const saasScore = countKeywordMatches(lower, SAAS_KEYWORDS);
  const portfolioScore =
    countKeywordMatches(lower, PORTFOLIO_KEYWORDS) +
    countPortfolioSignalBoost(lower);
  const landingScore = countKeywordMatches(lower, LANDING_KEYWORDS);
  const blogScore = countKeywordMatches(lower, BLOG_KEYWORDS);

  const bestContent = pickBestScaffold([
    { id: "saas-landing", score: saasScore },
    { id: "portfolio", score: portfolioScore },
    { id: "landing-page", score: landingScore },
    { id: "blog", score: blogScore },
  ]);

  if (bestContent) {
    return bestContent;
  }

  const contentScore = countKeywordMatches(lower, CONTENT_KEYWORDS);
  if (contentScore >= MIN_SCORE) {
    return getScaffoldByFamily("content-site");
  }

  if (buildIntent === "website" || buildIntent === "template") {
    return getScaffoldById("landing-page");
  }

  return getScaffoldByFamily("base-nextjs");
}

const EMBEDDING_MIN_SCORE = 0.35;
const GENERIC_EMBEDDING_MIN_SCORE = 0.45;

/** Normalizes raw keyword score for the selected scaffold to ~0..1 for head-to-head vs cosine. */
const KEYWORD_STRENGTH_CAP = 12;

/**
 * When cosine similarity is at least this fraction of normalized keyword strength,
 * the embedding pick wins (non-generic keyword case). Lower → embeddings win more often.
 * Override: `SAJTMASKIN_SCAFFOLD_EMBED_VS_KEYWORD_BIAS` (e.g. `0.75`–`1.1`).
 */
const DEFAULT_EMBED_VS_KEYWORD_BIAS = 0.82;

/** True → `matchScaffold()` does not use keyword lists; returns intent baseline only. */
export function isScaffoldKeywordMatchDisabled(): boolean {
  const v = process.env.SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH?.trim().toLowerCase();
  if (!v) return false;
  return v === "0" || v === "false" || v === "off" || v === "disabled";
}

function readEmbedVsKeywordBias(): number {
  const raw = process.env.SAJTMASKIN_SCAFFOLD_EMBED_VS_KEYWORD_BIAS?.trim();
  if (!raw) return DEFAULT_EMBED_VS_KEYWORD_BIAS;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 2) return DEFAULT_EMBED_VS_KEYWORD_BIAS;
  return n;
}

function defaultScaffoldForIntent(buildIntent?: BuildIntent | null): ScaffoldManifest {
  if (buildIntent === "website" || buildIntent === "template") {
    return getScaffoldById("landing-page")!;
  }
  return getScaffoldByFamily("base-nextjs")!;
}

function normalizedKeywordStrength(score: number): number {
  return Math.min(1, score / KEYWORD_STRENGTH_CAP);
}

function isGenericScaffoldId(id: string | null | undefined): boolean {
  return !id || id === "landing-page" || id === "base-nextjs";
}

function getEmbeddingOverrideReason(params: {
  keywordResult: ScaffoldManifest | null;
  keywordScores: Array<{ id: string; score: number }>;
  embeddingScaffold: ScaffoldManifest;
  embeddingScore: number;
  embedVsKeywordBias: number;
  authScore: number;
  appScore: number;
  dashboardScore: number;
  buildIntent?: BuildIntent | null;
}): string | null {
  const {
    keywordResult,
    keywordScores,
    embeddingScaffold,
    embeddingScore,
    embedVsKeywordBias,
    authScore,
    appScore,
    dashboardScore,
    buildIntent,
  } = params;

  if (embeddingScore < EMBEDDING_MIN_SCORE) return null;

  if (
    !canUseEmbeddingOverride({
      embeddingResult: embeddingScaffold,
      authScore,
      appScore,
      dashboardScore,
      buildIntent,
    })
  ) {
    return null;
  }

  if (keywordResult?.id === embeddingScaffold.id) {
    return null;
  }

  const kwId = keywordResult?.id ?? null;
  if (isGenericScaffoldId(kwId)) {
    if (embeddingScore < GENERIC_EMBEDDING_MIN_SCORE) return null;
    return "generic_keyword_override";
  }

  const kwScoreForPick = keywordScores.find((entry) => entry.id === kwId)?.score ?? 0;
  const kwNorm = normalizedKeywordStrength(kwScoreForPick);
  return embeddingScore >= kwNorm * embedVsKeywordBias
    ? "non_generic_strength_win"
    : null;
}

function canUseEmbeddingOverride(params: {
  embeddingResult: ScaffoldManifest;
  authScore: number;
  appScore: number;
  dashboardScore: number;
  buildIntent?: BuildIntent | null;
}): boolean {
  const { embeddingResult, authScore, appScore, dashboardScore, buildIntent } = params;
  if (embeddingResult.id === "auth-pages" && authScore < 1) {
    return false;
  }
  if (
    buildIntent !== "app" &&
    (embeddingResult.id === "dashboard" || embeddingResult.id === "app-shell") &&
    appScore < 1 &&
    dashboardScore < 1
  ) {
    return false;
  }
  if (
    buildIntent === "app" &&
    (embeddingResult.id === "portfolio" ||
      embeddingResult.id === "blog" ||
      embeddingResult.id === "landing-page")
  ) {
    return false;
  }
  return true;
}

const EMPTY_SEMANTIC_RESPONSE: ScaffoldSearchResponse = {
  results: [],
  diagnostics: {
    attempted: false,
    available: false,
    failed: false,
    unavailableReason: null,
    errorMessage: null,
    durationMs: null,
  },
};

/**
 * Async scaffold matching with explicit metadata for debugging/evaluation.
 * Keyword and embedding runs overlap in wall-clock time; the merged policy
 * lets embeddings challenge non-generic keyword picks when similarity is
 * strong enough (see `shouldPreferEmbeddingOverKeyword`).
 */
export async function matchScaffoldAuto(
  prompt: string,
  buildIntent?: BuildIntent | null,
  options: {
    useEmbeddings?: boolean;
    queryContext?: ScaffoldQueryContext;
    capabilities?: InferredCapabilities;
    generationMode?: "init" | "followUp";
    brief?: Record<string, unknown> | null;
  } = {},
): Promise<ScaffoldSelectionResult> {
  const useEmbeddings = options.useEmbeddings ?? true;
  const scaffoldPrompt = buildScaffoldPrompt(prompt, options.queryContext);
  const briefContextApplied = Boolean(
    options.queryContext &&
      ((options.queryContext.briefPages && options.queryContext.briefPages.length > 0) ||
        (options.queryContext.styleKeywords && options.queryContext.styleKeywords.length > 0) ||
        (options.queryContext.domainHints && options.queryContext.domainHints.length > 0)),
  );
  const lower = scaffoldPrompt.toLowerCase();

  const embeddingPromise = useEmbeddings
    ? searchScaffoldsWithDiagnostics(scaffoldPrompt, 3)
    : Promise.resolve(EMPTY_SEMANTIC_RESPONSE);

  const keywordResult = matchScaffold(scaffoldPrompt, buildIntent);
  const baseKeywordScores = applyBriefKeywordBoost(
    buildKeywordScores(lower, options.capabilities),
    options.queryContext,
  );
  const keywordsDisabled = isScaffoldKeywordMatchDisabled();
  const keywordScores = keywordsDisabled
    ? baseKeywordScores.map((entry) => ({ ...entry, score: 0 }))
    : baseKeywordScores;

  const keywordTopCandidates = getTopKeywordCandidates(keywordScores, keywordResult?.id ?? null);
  const maxKeywordScore = Math.max(...keywordScores.map((entry) => entry.score), 0);
  const keywordMethod = keywordsDisabled
    ? "default"
    : inferKeywordSelectionMethod({
        selectedScaffold: keywordResult,
        maxKeywordScore,
      });

  const keywordMetaBase: ScaffoldSelectionMeta = {
    selectedScaffold: keywordResult?.id ?? null,
    selectionMethod: keywordMethod,
    selectionConfidence: inferKeywordConfidence(maxKeywordScore, keywordMethod),
    topCandidates: keywordTopCandidates,
    keywordScores: keywordScoreRecord(keywordScores),
    embeddingAvailable: false,
    embeddingFailed: false,
    embeddingTopResult: null,
    semanticUnavailableReason: null,
    embeddingOverrideReason: null,
    briefContextApplied,
  };

  if (!useEmbeddings) {
    return {
      scaffold: keywordResult,
      meta: keywordMetaBase,
    };
  }

  const semantic = await embeddingPromise;
  const authScore = countKeywordMatches(lower, AUTH_KEYWORDS);
  const appScore = countKeywordMatches(lower, APP_KEYWORDS);
  const dashboardScore = countKeywordMatches(lower, DASHBOARD_KEYWORDS);
  const embedBias = readEmbedVsKeywordBias();

  const embeddingTopResult =
    semantic.results.length > 0
      ? {
          id: semantic.results[0].scaffold.id,
          score: semantic.results[0].score,
        }
      : null;

  const fallbackMeta: ScaffoldSelectionMeta = {
    ...keywordMetaBase,
    selectionConfidence: inferFallbackConfidence({
      selectedScaffold: keywordResult,
      currentConfidence: keywordMetaBase.selectionConfidence,
      semanticAvailable: semantic.diagnostics.available,
      semanticUnavailableReason: semantic.diagnostics.unavailableReason,
    }),
    topCandidates: withEmbeddingCandidate(keywordMetaBase.topCandidates, embeddingTopResult),
    embeddingAvailable: semantic.diagnostics.available,
    embeddingFailed: semantic.diagnostics.failed,
    embeddingTopResult,
    semanticUnavailableReason: semantic.diagnostics.unavailableReason,
    embeddingOverrideReason: null,
    briefContextApplied,
  };

  if (semantic.results.length === 0) {
    return {
      scaffold: keywordResult,
      meta: fallbackMeta,
    };
  }

  const top = semantic.results[0]!;
  const embeddingOverrideReason = getEmbeddingOverrideReason({
    keywordResult,
    keywordScores,
    embeddingScaffold: top.scaffold,
    embeddingScore: top.score,
    embedVsKeywordBias: embedBias,
    authScore,
    appScore,
    dashboardScore,
    buildIntent,
  });

  if (embeddingOverrideReason) {
    const embeddingConfidence: ScaffoldSelectionConfidence =
      top.score >= 0.55 ? "high" : "medium";
    return {
      scaffold: top.scaffold,
      meta: {
        ...fallbackMeta,
        selectedScaffold: top.scaffold.id,
        selectionMethod: "embedding",
        selectionConfidence: embeddingConfidence,
        embeddingOverrideReason,
      },
    };
  }

  return {
    scaffold: keywordResult,
    meta: fallbackMeta,
  };
}

