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
import { getScaffoldById, getScaffoldIds } from "./registry";
import {
  searchScaffoldsWithDiagnostics,
  type ScaffoldSearchResponse,
} from "./scaffold-search";
import {
  LANDING_KEYWORDS,
  SAAS_KEYWORDS,
  PORTFOLIO_KEYWORDS,
  PORTFOLIO_MEDIA_KEYWORDS,
  PORTFOLIO_ART_DIRECTION_KEYWORDS,
  BLOG_KEYWORDS,
  DASHBOARD_KEYWORDS,
  APP_KEYWORDS,
  AUTH_KEYWORDS,
  ECOMMERCE_KEYWORDS,
  HOSPITALITY_SERVICE_KEYWORDS,
  STRONG_ECOMMERCE_INTENT,
} from "./keyword-banks";
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

/**
 * Positive capability/brief boosts may reorder scaffolds that already clear
 * MIN_SCORE on unboosted keyword evidence. They must not promote a
 * sub-threshold candidate across the selection floor (e.g. raw app-shell=1
 * + needsAppShell +2 must not beat a website default).
 * Negative amounts (penalties) always apply.
 */
function boostScore(
  scores: Array<{ id: string; score: number }>,
  id: string,
  amount: number,
): void {
  const entry = scores.find((s) => s.id === id);
  if (!entry) return;
  if (amount < 0) {
    entry.score += amount;
    return;
  }
  if (entry.score >= MIN_SCORE) {
    entry.score += amount;
  }
}

export type ScaffoldSelectionMethod =
  | "off"
  | "manual"
  | "persisted"
  | "keyword"
  | "embedding"
  | "agreement"
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
    { id: "base-nextjs", score: 0 },
  ];

  if (capabilities) {
    if (capabilities.needsDataUI) boostScore(scores, "dashboard", 2);
    if (capabilities.needsCharts) boostScore(scores, "dashboard", 2);
    if (capabilities.needsAppShell) boostScore(scores, "app-shell", 2);
    if (capabilities.needsAuth) boostScore(scores, "auth-pages", 2);
    if (capabilities.needsEcommerce) boostScore(scores, "ecommerce", 2);
    // Game builds belong on a minimal runtime, not a landing/marketing
    // scaffold — landing-page/saas-landing drag in hero+features+pricing
    // sections that directly compete with the playable area. Positive
    // boosts only reorder already-eligible scores; penalties always apply
    // so marketing scaffolds cannot win on weak game prompts. Sync path
    // also uses `applyGameKeywordPreference` for noun/verb game gates.
    if (capabilities.needsGame) {
      boostScore(scores, "app-shell", 3);
      boostScore(scores, "base-nextjs", 3);
      boostScore(scores, "landing-page", -3);
      boostScore(scores, "saas-landing", -3);
      boostScore(scores, "portfolio", -2);
      boostScore(scores, "blog", -2);
    }
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

  // Brief contributes real keyword counts (unboosted eligibility), not a
  // flat +2 that could promote a single-token hit over MIN_SCORE. Same
  // hospitality ecommerce veto as prompt-side scoring.
  //
  // Use max() rather than sum so restating a prompt token in the brief
  // ("portal" again) cannot manufacture a second hit and cross MIN_SCORE.
  // Complementary brief-only signals still win via Math.max(0, briefScore).
  const briefScores = buildKeywordScores(combinedText);
  const briefById = new Map(briefScores.map((entry) => [entry.id, entry.score]));
  return scores.map((entry) => ({
    ...entry,
    score: Math.max(entry.score, briefById.get(entry.id) ?? 0),
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

/**
 * Website is the only provisional intent that may legitimately rank an app
 * scaffold: orchestration can promote an inherited website default to app,
 * but only after the prompt/brief contains the same two raw app/dashboard
 * signals required by keyword ranking. Capability boosts and embedding
 * similarity are not promotion evidence by themselves.
 * Explicit Byggval is clamped by `scaffoldForExplicitIntent`, while the final
 * effective-intent invariant in orchestration covers every selection source.
 */
function canRankForBuildIntent(
  scaffold: ScaffoldManifest,
  buildIntent?: BuildIntent | null,
  provisionalWebsiteAppEvidence = 0,
): boolean {
  if (buildIntent !== "website" && buildIntent !== "app" && buildIntent !== "template") {
    return true;
  }
  if (scaffold.allowedBuildIntents.includes(buildIntent)) return true;
  return (
    buildIntent === "website" &&
    scaffold.allowedBuildIntents.includes("app") &&
    provisionalWebsiteAppEvidence >= MIN_SCORE
  );
}

function eligibleKeywordScores(
  scores: Array<{ id: string; score: number }>,
  buildIntent?: BuildIntent | null,
  prompt = "",
): Array<{ id: string; score: number }> {
  const provisionalWebsiteAppEvidence =
    countKeywordMatches(prompt.toLowerCase(), APP_KEYWORDS) +
    countKeywordMatches(prompt.toLowerCase(), DASHBOARD_KEYWORDS);
  return scores.filter((entry) => {
    const scaffold = getScaffoldById(entry.id);
    return Boolean(
      scaffold && canRankForBuildIntent(scaffold, buildIntent, provisionalWebsiteAppEvidence),
    );
  });
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
/**
 * Narrow game-prompt gate shared by synchronous and async keyword ranking.
 * Capability inference also boosts/penalises via `buildKeywordScores`, but
 * the synchronous path runs before orchestration has inferred capabilities
 * and would otherwise hand a Pac-Man / Snake prompt to `landing-page`.
 *
 * Narrow by design — pattern must name an actual game noun or verb,
 * not just the token `spel` (which collides with "tv-spel butik" or
 * "rollspel" / "skådespel"). Keep in sync with the high-precision
 * rows of `CAPABILITY_VOCABULARY.interactive-game` in
 * `src/lib/builder/follow-up-capability-vocabulary.ts`.
 */
const GAME_SYNC_PATTERN =
  /(?<![\p{L}\p{N}_])(?:pac-?man|pacman|snake(?:-?game)?|tetris|breakout|pong|arkanoid|space-?invaders|flappy(?:-?bird)?|asteroids|frogger|galaga|platformer|arcade-?game|playable\s+canvas|mini-?game|mini-?spel|quiz-?game|quiz-?spel|reaction-?game|reaktionsspel|memory-?game|minnesspel|tv-?spel|video-?spel|dator-?spel|browser-?spel)(?![\p{L}\p{N}_])/iu;

/**
 * Retail / news / commentary signals that mention game-related nouns but
 * are NOT build-a-game requests. Keep in sync with the vetoes in
 * `CAPABILITY_VOCABULARY.interactive-game` so the sync matcher and the
 * follow-up detector agree on the non-game cases.
 *
 * Examples:
 *  - "sajt för en tv-spel butik" → marketing for a retail store
 *  - "bygg en gaming news blog" → content site, not a game
 *  - "esport-site för vår liga" → portal, not a game
 */
const GAME_SYNC_VETO_PATTERN =
  /(?<![\p{L}\p{N}_])(?:tv-?spel\s+butik|spel[-\s]?butik|game[-\s]?store|gaming[-\s]?news|gaming[-\s]?blog|e-?sport(?:[-\s]?nyheter)?|esport[-\s]?site)(?![\p{L}\p{N}_])/iu;

function applyGameKeywordPreference(
  scores: Array<{ id: string; score: number }>,
  prompt: string,
  buildIntent?: BuildIntent | null,
): Array<{ id: string; score: number }> {
  if (!GAME_SYNC_PATTERN.test(prompt) || GAME_SYNC_VETO_PATTERN.test(prompt)) {
    return scores;
  }

  const preferredId = buildIntent === "app" ? "app-shell" : "base-nextjs";
  const highestScore = Math.max(...scores.map((entry) => entry.score), MIN_SCORE - 1);
  return scores.map((entry) =>
    entry.id === preferredId ? { ...entry, score: highestScore + 1 } : entry,
  );
}

function rankKeywordScaffolds(
  prompt: string,
  scores: Array<{ id: string; score: number }>,
  buildIntent?: BuildIntent | null,
): {
  scores: Array<{ id: string; score: number }>;
  eligibleScores: Array<{ id: string; score: number }>;
  scaffold: ScaffoldManifest;
} {
  const gameAdjustedScores = applyGameKeywordPreference(scores, prompt, buildIntent);
  const eligibleScores = eligibleKeywordScores(gameAdjustedScores, buildIntent, prompt);
  return {
    scores: gameAdjustedScores,
    eligibleScores,
    scaffold: pickBestScaffold(eligibleScores) ?? defaultScaffoldForIntent(buildIntent),
  };
}

export function matchScaffold(
  prompt: string,
  buildIntent?: BuildIntent | null,
): ScaffoldManifest | null {
  if (isScaffoldKeywordMatchDisabled()) {
    return defaultScaffoldForIntent(buildIntent);
  }

  return rankKeywordScaffolds(
    prompt,
    buildKeywordScores(prompt.toLowerCase()),
    buildIntent,
  ).scaffold;
}

const EMBEDDING_MIN_SCORE = 0.35;
const GENERIC_EMBEDDING_MIN_SCORE = 0.45;

/** Normalizes raw keyword score for the selected scaffold to ~0..1 for head-to-head vs cosine. */
const KEYWORD_STRENGTH_CAP = 12;

/**
 * When cosine similarity is at least this fraction of normalized keyword strength,
 * the embedding pick wins (non-generic keyword case). Lower → embeddings win more often.
 * Override: `SAJTMASKIN_SCAFFOLD_EMBED_VS_KEYWORD_BIAS` (e.g. `0.55`–`1.1`).
 *
 * Lowered from 0.82 → 0.65 (2026-04-17) so embeddings are weighted more heavily
 * against keyword matches when the two diverge. Cosine similarity ≥ 0.55 is
 * empirically a strong signal in our scaffold corpus.
 */
const DEFAULT_EMBED_VS_KEYWORD_BIAS = 0.65;

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

/**
 * Baseline scaffold for an intent. Exported so callers that reject a matched
 * scaffold (e.g. an app-only pick under an explicit Hemsida choice) land on the
 * same default the matcher itself would have used, instead of re-deriving the
 * intent→scaffold mapping and creating a second source of truth.
 */
export function defaultScaffoldForIntent(buildIntent?: BuildIntent | null): ScaffoldManifest {
  if (buildIntent === "website" || buildIntent === "template") {
    return getScaffoldById("landing-page")!;
  }
  // B1: app-intent must default to app-shell, not base-nextjs, when keyword
  // matching is disabled (`SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH=off`) and
  // embeddings are unavailable / score below the override threshold.
  if (buildIntent === "app") {
    return getScaffoldById("app-shell")!;
  }
  return getScaffoldById("base-nextjs")!;
}

/** Resolves any manifest mismatch against a final, authoritative build intent. */
export function scaffoldForIntent(
  scaffold: ScaffoldManifest | null | undefined,
  buildIntent: BuildIntent | null | undefined,
): ScaffoldManifest | null {
  if (!scaffold) return null;
  if (buildIntent !== "website" && buildIntent !== "app" && buildIntent !== "template") {
    return scaffold;
  }
  if (scaffold.allowedBuildIntents.includes(buildIntent)) return scaffold;
  return defaultScaffoldForIntent(buildIntent);
}

/**
 * Keep a scaffold pick honest against an EXPLICIT Hemsida/App choice.
 *
 * Both the keyword matcher and the embedding path can return an app-only scaffold
 * for a website prompt when app vocabulary scores high; the website→app promotion
 * used to make that self-consistent by flipping the intent. An explicit user
 * choice suppresses that promotion, so the mismatch has to be resolved on the
 * scaffold side instead — otherwise a run claims `website` while sitting on a
 * scaffold whose `allowedBuildIntents` is `["app"]`.
 *
 * Shared by the create-chat pre-match (which steers the Deep Brief) and
 * `resolve-base` (which steers codegen), so the two cannot disagree about which
 * scaffold survived.
 */
export function scaffoldForExplicitIntent(
  scaffold: ScaffoldManifest | null | undefined,
  buildIntent: BuildIntent | null | undefined,
): ScaffoldManifest | null {
  return scaffoldForIntent(scaffold, buildIntent);
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
  hospitalityScore: number;
  strongEcommerceScore: number;
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
    hospitalityScore,
    strongEcommerceScore,
    buildIntent,
  } = params;

  if (embeddingScore < EMBEDDING_MIN_SCORE) return null;

  if (
    !canUseEmbeddingOverride({
      embeddingResult: embeddingScaffold,
      authScore,
      appScore,
      dashboardScore,
      hospitalityScore,
      strongEcommerceScore,
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
  hospitalityScore: number;
  strongEcommerceScore: number;
  buildIntent?: BuildIntent | null;
}): boolean {
  const { embeddingResult, authScore, appScore, dashboardScore, hospitalityScore, strongEcommerceScore, buildIntent } = params;
  if (embeddingResult.id === "auth-pages" && authScore < 1) {
    return false;
  }
  if (
    embeddingResult.id === "ecommerce" &&
    hospitalityScore > 0 &&
    strongEcommerceScore === 0
  ) {
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
  // Embedding query uses prompt+brief (`scaffoldPrompt`). Keyword selection
  // scores the original prompt, then `applyBriefKeywordBoost` adds real
  // brief keyword counts (not a flat +2) so brief evidence can meet
  // MIN_SCORE without double-counting the same tokens via a second boost.
  const lowerPrompt = prompt.toLowerCase();
  const lowerScaffold = scaffoldPrompt.toLowerCase();

  const embeddingPromise = useEmbeddings
    ? searchScaffoldsWithDiagnostics(scaffoldPrompt, getScaffoldIds().length)
    : Promise.resolve(EMPTY_SEMANTIC_RESPONSE);

  const baseKeywordScores = applyBriefKeywordBoost(
    buildKeywordScores(lowerPrompt, options.capabilities),
    options.queryContext,
  );
  const keywordsDisabled = isScaffoldKeywordMatchDisabled();
  const unrankedKeywordScores = keywordsDisabled
    ? baseKeywordScores.map((entry) => ({ ...entry, score: 0 }))
    : baseKeywordScores;
  const keywordRanking = keywordsDisabled
    ? {
        scores: unrankedKeywordScores,
        eligibleScores: eligibleKeywordScores(
          unrankedKeywordScores,
          buildIntent,
          scaffoldPrompt,
        ),
        scaffold: defaultScaffoldForIntent(buildIntent),
      }
    : rankKeywordScaffolds(scaffoldPrompt, unrankedKeywordScores, buildIntent);
  const keywordScores = keywordRanking.scores;
  const keywordEligibleScores = keywordRanking.eligibleScores;
  const keywordResult = keywordRanking.scaffold;

  const keywordTopCandidates = getTopKeywordCandidates(
    keywordEligibleScores,
    keywordResult?.id ?? null,
  );
  const maxKeywordScore = Math.max(...keywordEligibleScores.map((entry) => entry.score), 0);
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
  // Override-guards intentionally use prompt+brief: a brief that says
  // "checkout flow" is just as good evidence as the prompt itself for
  // gating an ecommerce-embedding override.
  const authScore = countKeywordMatches(lowerScaffold, AUTH_KEYWORDS);
  const appScore = countKeywordMatches(lowerScaffold, APP_KEYWORDS);
  const dashboardScore = countKeywordMatches(lowerScaffold, DASHBOARD_KEYWORDS);
  const hospitalityScore = countKeywordMatches(lowerScaffold, HOSPITALITY_SERVICE_KEYWORDS);
  const strongEcommerceScore = countKeywordMatches(lowerScaffold, STRONG_ECOMMERCE_INTENT);
  const embedBias = readEmbedVsKeywordBias();

  const provisionalWebsiteAppEvidence = appScore + dashboardScore;
  const top = semantic.results.find((result) =>
    canRankForBuildIntent(result.scaffold, buildIntent, provisionalWebsiteAppEvidence),
  );
  const embeddingTopResult =
    top
      ? {
          id: top.scaffold.id,
          score: top.score,
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

  if (!top) {
    return {
      scaffold: keywordResult,
      meta: fallbackMeta,
    };
  }

  if (
    keywordResult &&
    keywordResult.id === top.scaffold.id &&
    top.score >= EMBEDDING_MIN_SCORE
  ) {
    const agreementConfidence: ScaffoldSelectionConfidence =
      top.score >= 0.55 ? "high" : "medium";
    return {
      scaffold: keywordResult,
      meta: {
        ...fallbackMeta,
        selectionMethod: "agreement",
        selectionConfidence: agreementConfidence,
        embeddingOverrideReason: null,
      },
    };
  }

  const embeddingOverrideReason = getEmbeddingOverrideReason({
    keywordResult,
    keywordScores,
    embeddingScaffold: top.scaffold,
    embeddingScore: top.score,
    embedVsKeywordBias: embedBias,
    authScore,
    appScore,
    dashboardScore,
    hospitalityScore,
    strongEcommerceScore,
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
