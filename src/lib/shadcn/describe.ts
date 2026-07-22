/**
 * "Beskriv"-discovery-lager (Fas 1)
 * =================================
 *
 * Server-side core for `POST /api/shadcn/describe`. Translates a free-text UI
 * description into shadcn-registry search queries, searches the official +
 * community registries over HTTP (via the existing `registry-service`), and
 * ranks the REAL matches against the description.
 *
 * Design (plan 2026-07-22-shadcn-registry-beskriv-komposition.md, Fas 1):
 * - Fas 0-spike decided: HTTP-fetch, NOT the `shadcn/registry` program-API
 *   (which drags in the whole CLI toolchain). No `shadcn` runtime dep.
 * - Built-in `@shadcn`/`@v0` are reached via `registry-service`'s base URL and
 *   MUST NOT be declared in `components.json` "registries" (CLI 4.x rejects it).
 *   Community registries (`@shadcnblocks`/`@tailark`/`@magicui`) are read from
 *   `components.json` (canonical registry list); their item catalog is seeded
 *   from `config/community-registries.json` (no community index endpoint yet).
 * - `searchRegistries` is fuzzy on name/description, not semantic — an LLM
 *   translates sentence → queries and ranks real hits. Both LLM steps fall back
 *   to a deterministic heuristic so the route works even without a provider key.
 * - No-results robustness: a whole sentence often yields 0 hits → the query is
 *   simplified and search retried.
 *
 * This module WRITES NOTHING to the user site — it only reads registries.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateObject } from "ai";
import { z } from "zod";

import type { ShadcnRegistryItem } from "@/lib/shadcn/registry-types";
import {
  buildPreviewImageUrl,
  fetchRegistryItem,
  fetchRegistryIndex,
  isUsableRegistryItem,
  type RegistryIndexItem,
} from "@/lib/shadcn/registry-service";
import { createDirectModel } from "@/lib/builder/direct-model";
import {
  AUTO_BRIEF_MODEL_ANTHROPIC,
  AUTO_BRIEF_MODEL_OPENAI,
} from "@/lib/gen/defaults";
import { debugLog } from "@/lib/utils/debug";

// ============================================================================
// TYPES
// ============================================================================

/** Built-in official registry namespace. Never declared in components.json. */
export const OFFICIAL_REGISTRY = "@shadcn";

export interface DescribeCandidate {
  /** Registry-local item name, e.g. `login-03` or `hero1`. */
  name: string;
  /** Registry namespace, e.g. `@shadcn`, `@shadcnblocks`, `@tailark`, `@magicui`. */
  registry: string;
  title?: string;
  description?: string;
  /** Light-theme preview PNG (official registry only). */
  previewLight?: string;
  /** Dark-theme preview PNG (official registry only). */
  previewDark?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  /** Ready-to-run `shadcn add` command for this candidate. */
  addCommand: string;
  /** Short rationale from the ranking step (LLM or heuristic). */
  reason?: string;
}

export interface DescribeInput {
  description: string;
  /** Max candidates to return (clamped to 1..10; default 8). */
  limit?: number;
  /** Optional style override forwarded to the official registry fetch. */
  style?: string;
}

export interface DescribeResult {
  candidates: DescribeCandidate[];
  /** Effective queries used (after any no-results simplification). */
  queries: string[];
  /** True when the initial queries returned 0 hits and were simplified. */
  usedFallbackQueries: boolean;
  /** Which ranking path produced the order. */
  ranking: "llm" | "heuristic";
}

/** A community registry the discovery layer can search + hydrate from. */
export interface CommunityRegistryDescriptor {
  namespace: string;
  /** URL template with a mandatory `{name}` placeholder. */
  urlTemplate: string;
  description?: string;
  /** Known item names (seeded from community-registries.json section maps). */
  itemNames: string[];
}

interface MatchedRef {
  registry: string;
  name: string;
  title?: string;
  description?: string;
  score: number;
}

/** Injectable dependencies so the orchestrator is unit-testable without network. */
export interface DescribeDeps {
  generateQueries: (description: string) => Promise<string[]>;
  rankCandidates: (
    description: string,
    candidates: DescribeCandidate[],
    limit: number,
  ) => Promise<{ candidates: DescribeCandidate[]; ranking: "llm" | "heuristic" }>;
  fetchOfficialIndex: (style?: string) => Promise<RegistryIndexItem[]>;
  fetchItem: (ref: {
    registry: string;
    name: string;
    style?: string;
  }) => Promise<ShadcnRegistryItem | null>;
  communityRegistries: CommunityRegistryDescriptor[];
}

// ============================================================================
// TUNING CONSTANTS
// ============================================================================

const DEFAULT_LIMIT = 8;
const MIN_LIMIT = 1;
const MAX_LIMIT = 10;
/** Max official index hits considered before hydration. */
const MAX_OFFICIAL_MATCHES = 12;
/** Max community hits considered before hydration. */
const MAX_COMMUNITY_MATCHES = 8;
/** Hard cap on how many candidates we hydrate (bounds outbound requests). */
const HYDRATE_CAP = 12;
const COMMUNITY_FETCH_TIMEOUT_MS = 3_000;
/**
 * Per-call ceilings for the two LLM steps. A stalled provider connection is
 * aborted and the deterministic heuristic takes over — so a slow provider
 * degrades to a fast heuristic answer instead of burning the whole route
 * budget (`maxDuration`) into a 504.
 */
const QUERY_LLM_TIMEOUT_MS = 20_000;
const RANK_LLM_TIMEOUT_MS = 25_000;
/**
 * Ceiling for each official registry HTTP call. `fetchRegistryIndex` /
 * `fetchRegistryItem` (shared registry-service) take no abort signal, so we
 * bound them at the orchestrator level: a stuck upstream degrades to the
 * heuristic/index data instead of blocking the route until `maxDuration`.
 */
const OFFICIAL_FETCH_TIMEOUT_MS = 5_000;

const COMPONENTS_JSON_PATH = join(process.cwd(), "components.json");
const COMMUNITY_REGISTRIES_PATH = join(
  process.cwd(),
  "config",
  "community-registries.json",
);

// ============================================================================
// TEXT HELPERS (pure)
// ============================================================================

// Unicode-aware so Swedish words (ändra, försäljning …) tokenize correctly.
const TOKEN_SPLIT_RE = /[^\p{L}\p{N}]+/u;

/** Swedish + English function words to drop from queries. */
const STOPWORDS = new Set<string>([
  // Swedish
  "en", "ett", "och", "eller", "med", "som", "för", "till", "av", "den", "det",
  "de", "på", "i", "är", "att", "samt", "ska", "vill", "jag", "vi", "min",
  "mina", "har", "vid", "om", "ett", "ur", "per", "mot", "utan", "hos",
  // English
  "a", "an", "the", "and", "or", "with", "that", "for", "to", "of", "in", "is",
  "are", "my", "we", "i", "want", "need", "on", "as", "at", "by", "it", "this",
  "some", "using", "use",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(TOKEN_SPLIT_RE)
    .filter(Boolean);
}

function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Deterministic query generation from a free-text description. Used as the LLM
 * fallback and for the no-results retry. Produces up to 3 short, de-duplicated
 * keyword queries. Never returns an empty array for a non-empty description.
 */
export function fallbackQueriesFromDescription(description: string): string[] {
  const tokens = contentTokens(description);
  // De-dupe preserving order.
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const token of tokens) {
    if (!seen.has(token)) {
      seen.add(token);
      keywords.push(token);
    }
  }

  if (keywords.length === 0) {
    const raw = description.trim().toLowerCase();
    return raw ? [raw.slice(0, 40)] : [];
  }

  const queries: string[] = [];
  const add = (q: string) => {
    const trimmed = q.trim();
    if (trimmed && !queries.includes(trimmed)) queries.push(trimmed);
  };

  // Broadest signal: the single most specific keyword (longest).
  const longest = [...keywords].sort((a, b) => b.length - a.length)[0];
  add(longest);
  // A compact 2-3 keyword query.
  add(keywords.slice(0, 3).join(" "));
  // A secondary pairing if there are enough distinct keywords.
  if (keywords.length > 3) add(keywords.slice(1, 3).join(" "));

  return queries.slice(0, 3);
}

/**
 * Reduce one query to its single most specific keyword (no-results fallback).
 * Returns "" when the query has no content token.
 */
export function simplifyQuery(query: string): string {
  const tokens = contentTokens(query);
  if (tokens.length === 0) return "";
  return [...tokens].sort((a, b) => b.length - a.length)[0];
}

/**
 * Simplify a set of queries for the no-results retry. Falls back to
 * description-derived keywords when simplification collapses to nothing new.
 */
export function simplifyQueries(queries: string[], description: string): string[] {
  const simplified: string[] = [];
  for (const q of queries) {
    const s = simplifyQuery(q);
    if (s && !simplified.includes(s)) simplified.push(s);
  }
  const original = new Set(queries.map((q) => q.trim().toLowerCase()));
  const isNew = simplified.some((q) => !original.has(q.toLowerCase()));
  if (simplified.length > 0 && isNew) return simplified;
  return fallbackQueriesFromDescription(description);
}

function scoreText(searchText: string, queryTokens: string[]): number {
  const lower = searchText.toLowerCase();
  const textTokens = new Set(tokenize(lower));
  let score = 0;
  for (const q of queryTokens) {
    if (!q) continue;
    if (textTokens.has(q)) score += 2;
    else if (lower.includes(q)) score += 1;
  }
  return score;
}

// ============================================================================
// SEARCH (pure over provided data)
// ============================================================================

function officialSearchText(item: RegistryIndexItem): string {
  return [item.name, item.title, item.description, ...(item.categories ?? [])]
    .filter(Boolean)
    .join(" ");
}

/**
 * Fuzzy-match the official registry index against the queries. Returns the
 * highest-scoring items (name/title/description/category token overlap).
 */
export function matchOfficialIndex(
  items: RegistryIndexItem[],
  queries: string[],
  max: number = MAX_OFFICIAL_MATCHES,
): MatchedRef[] {
  const queryTokenSets = queries.map((q) => tokenize(q));
  const scored: MatchedRef[] = [];
  for (const item of items) {
    if (!item?.name) continue;
    const searchText = officialSearchText(item);
    let score = 0;
    for (const tokens of queryTokenSets) score += scoreText(searchText, tokens);
    if (score > 0) {
      scored.push({
        registry: OFFICIAL_REGISTRY,
        name: item.name,
        title: item.title,
        description: item.description,
        score,
      });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, max));
}

/**
 * Match community registries against the queries. Community registries have no
 * searchable index endpoint, so we score their seeded item names + namespace
 * description and surface the best-matching names for hydration/verification.
 */
export function matchCommunityItems(
  registries: CommunityRegistryDescriptor[],
  queries: string[],
  max: number = MAX_COMMUNITY_MATCHES,
): MatchedRef[] {
  const queryTokenSets = queries.map((q) => tokenize(q));
  const scored: MatchedRef[] = [];
  for (const registry of registries) {
    const descriptionText = registry.description ?? "";
    let descriptionScore = 0;
    for (const tokens of queryTokenSets) {
      descriptionScore += scoreText(descriptionText, tokens);
    }
    for (const name of registry.itemNames) {
      const searchText = `${name} ${descriptionText}`;
      let score = 0;
      for (const tokens of queryTokenSets) score += scoreText(searchText, tokens);
      // A namespace-level description hit lends a small bias to its items so a
      // relevant registry surfaces even when item names are opaque (e.g. hero1).
      const total = score + (descriptionScore > 0 ? 1 : 0);
      if (total > 0) {
        scored.push({ registry: registry.namespace, name, score: total });
      }
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, max));
}

// ============================================================================
// CANDIDATE ASSEMBLY (pure)
// ============================================================================

/** Build a ready-to-run `shadcn add` command for a candidate. */
export function buildAddCommand(registry: string, name: string): string {
  if (registry && registry !== OFFICIAL_REGISTRY) {
    // Community namespaces are added namespace-qualified.
    return `npx shadcn@latest add ${registry}/${name}`;
  }
  return `npx shadcn@latest add ${name}`;
}

function toCandidate(
  ref: MatchedRef,
  item: ShadcnRegistryItem | null,
  style?: string,
): DescribeCandidate {
  const name = item?.name?.trim() || ref.name;
  const isOfficial = ref.registry === OFFICIAL_REGISTRY;
  return {
    name,
    registry: ref.registry,
    title: item?.title ?? ref.title,
    description: item?.description ?? ref.description,
    previewLight: isOfficial ? buildPreviewImageUrl(name, "light", style) : undefined,
    previewDark: isOfficial ? buildPreviewImageUrl(name, "dark", style) : undefined,
    dependencies: item?.dependencies,
    registryDependencies: item?.registryDependencies,
    addCommand: buildAddCommand(ref.registry, name),
  };
}

// ============================================================================
// RANKING
// ============================================================================

/**
 * Deterministic ranking fallback: score each candidate by token overlap of the
 * description against name/title/description, then take the top `limit`.
 */
export function heuristicRankCandidates(
  description: string,
  candidates: DescribeCandidate[],
  limit: number,
): DescribeCandidate[] {
  const queryTokens = tokenize(description);
  const scored = candidates.map((candidate) => {
    const searchText = [candidate.name, candidate.title, candidate.description]
      .filter(Boolean)
      .join(" ");
    return { candidate, score: scoreText(searchText, queryTokens) };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
    .map(({ candidate }) => ({ ...candidate, reason: candidate.reason ?? "keyword match" }));
}

// ============================================================================
// COMMUNITY REGISTRY LOADING (impure, file-backed)
// ============================================================================

interface ComponentsJsonShape {
  registries?: Record<string, string | { url?: string }>;
}

interface CommunitySeedEntry {
  namespace: string;
  url: string;
  sectionMappings?: Record<string, string[]>;
}

/**
 * Merge the canonical registry list from `components.json` with the item-name
 * catalog seeded in `config/community-registries.json`. The registry list +
 * URL templates come from `components.json` (canonical); the item names are the
 * only "what exists" catalog we have until a community index endpoint lands.
 */
export function mergeCommunityRegistries(
  componentsRegistries: Record<string, string | { url?: string }>,
  seed: CommunitySeedEntry[],
): CommunityRegistryDescriptor[] {
  const seedByNamespace = new Map<string, CommunitySeedEntry>();
  for (const entry of seed) {
    if (entry?.namespace) seedByNamespace.set(entry.namespace, entry);
  }

  const descriptors: CommunityRegistryDescriptor[] = [];
  for (const [namespace, value] of Object.entries(componentsRegistries ?? {})) {
    const urlTemplate = typeof value === "string" ? value : (value?.url ?? "");
    if (!urlTemplate || !urlTemplate.includes("{name}")) continue;
    const seedEntry = seedByNamespace.get(namespace);
    const itemNames = seedEntry?.sectionMappings
      ? Array.from(new Set(Object.values(seedEntry.sectionMappings).flat()))
      : [];
    descriptors.push({
      namespace,
      urlTemplate,
      description: describeCommunityNamespace(seedEntry),
      itemNames,
    });
  }
  return descriptors;
}

function describeCommunityNamespace(seed: CommunitySeedEntry | undefined): string {
  if (!seed?.sectionMappings) return "";
  // Section keys double as human-readable capability hints for scoring.
  return Object.keys(seed.sectionMappings).join(" ");
}

function safeReadJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

/**
 * Load the searchable community registries from disk. Registry list + URL
 * templates from `components.json`; item catalog from the seed file. Degrades
 * to an empty list when either file is missing/unreadable (official search
 * still works).
 */
export function loadDescribeCommunityRegistries(): CommunityRegistryDescriptor[] {
  const componentsJson = safeReadJson<ComponentsJsonShape>(COMPONENTS_JSON_PATH);
  const seed = safeReadJson<CommunitySeedEntry[]>(COMMUNITY_REGISTRIES_PATH) ?? [];
  if (!componentsJson?.registries) return [];
  return mergeCommunityRegistries(componentsJson.registries, seed);
}

// ============================================================================
// LLM STEPS (impure, with deterministic fallback)
// ============================================================================

/** Pick a runnable prompt-assist model, preferring OpenAI, else Anthropic. */
function resolveDescribeModel(): string | null {
  if (process.env.OPENAI_API_KEY?.trim()) return AUTO_BRIEF_MODEL_OPENAI;
  if (process.env.ANTHROPIC_API_KEY?.trim()) return AUTO_BRIEF_MODEL_ANTHROPIC;
  return null;
}

const queriesSchema = z.object({
  queries: z
    .array(z.string().trim().min(1).max(60))
    .min(1)
    .max(3)
    .describe("1-3 short keyword search queries for the shadcn registry"),
});

const QUERY_SYSTEM_PROMPT =
  "You translate a free-text UI description (Swedish or English) into 1-3 SHORT " +
  "keyword search queries for the shadcn/ui component registry. The registry search " +
  "is fuzzy on component name/description, NOT semantic, so a whole sentence usually " +
  "returns nothing. Output 1-3 lowercase English queries of 1-3 words each (e.g. " +
  "\"login\", \"bar chart\", \"pricing table\"). Prefer canonical shadcn component/block " +
  "vocabulary. Do not add commentary.";

/**
 * LLM query generation with a deterministic fallback. Never throws — returns
 * heuristic queries when no model/key is available or the call fails.
 */
export async function generateQueriesWithLlm(description: string): Promise<string[]> {
  const model = resolveDescribeModel();
  const fallback = fallbackQueriesFromDescription(description);
  if (!model) return fallback;
  try {
    const result = await generateObject({
      model: createDirectModel(model),
      schema: queriesSchema,
      messages: [
        { role: "system", content: QUERY_SYSTEM_PROMPT },
        { role: "user", content: description },
      ],
      maxRetries: 1,
      maxOutputTokens: 512,
      abortSignal: AbortSignal.timeout(QUERY_LLM_TIMEOUT_MS),
    });
    const queries = result.object.queries
      .map((q) => q.trim().toLowerCase())
      .filter(Boolean);
    const deduped = Array.from(new Set(queries));
    return deduped.length > 0 ? deduped.slice(0, 3) : fallback;
  } catch (err) {
    debugLog("shadcn-describe", "query generation fell back to heuristic", {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

const rankSchema = z.object({
  picks: z
    .array(
      z.object({
        index: z.number().int().describe("0-based index of the candidate"),
        reason: z.string().trim().max(200).describe("short why-this-matches note"),
      }),
    )
    .max(MAX_LIMIT),
});

/**
 * LLM ranking of REAL candidates against the description, with a heuristic
 * fallback. Only ever selects from the provided candidates (index-based), so it
 * cannot fabricate a non-existent registry item.
 */
export async function rankCandidatesWithLlm(
  description: string,
  candidates: DescribeCandidate[],
  limit: number,
): Promise<{ candidates: DescribeCandidate[]; ranking: "llm" | "heuristic" }> {
  if (candidates.length === 0) return { candidates: [], ranking: "heuristic" };
  const model = resolveDescribeModel();
  if (!model) {
    return { candidates: heuristicRankCandidates(description, candidates, limit), ranking: "heuristic" };
  }

  const catalog = candidates
    .map((candidate, index) => {
      const meta = [
        `registry=${candidate.registry}`,
        candidate.registryDependencies?.length
          ? `registryDeps=${candidate.registryDependencies.join(",")}`
          : null,
      ]
        .filter(Boolean)
        .join(" ");
      const desc = candidate.description ? ` — ${candidate.description}` : "";
      return `[${index}] ${candidate.name} (${meta})${desc}`;
    })
    .join("\n");

  try {
    const result = await generateObject({
      model: createDirectModel(model),
      schema: rankSchema,
      messages: [
        {
          role: "system",
          content:
            "You rank shadcn registry candidates by how well they match the user's " +
            "description. Return ONLY indexes from the provided list, best first, at " +
            `most ${limit} picks. Never invent components. Give a short reason per pick.`,
        },
        {
          role: "user",
          content: `Description:\n${description}\n\nCandidates:\n${catalog}`,
        },
      ],
      maxRetries: 1,
      maxOutputTokens: 1_024,
      abortSignal: AbortSignal.timeout(RANK_LLM_TIMEOUT_MS),
    });

    const seen = new Set<number>();
    const ranked: DescribeCandidate[] = [];
    for (const pick of result.object.picks) {
      const idx = pick.index;
      if (idx < 0 || idx >= candidates.length || seen.has(idx)) continue;
      seen.add(idx);
      ranked.push({ ...candidates[idx], reason: pick.reason || undefined });
      if (ranked.length >= limit) break;
    }
    if (ranked.length === 0) {
      return { candidates: heuristicRankCandidates(description, candidates, limit), ranking: "heuristic" };
    }
    return { candidates: ranked, ranking: "llm" };
  } catch (err) {
    debugLog("shadcn-describe", "ranking fell back to heuristic", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { candidates: heuristicRankCandidates(description, candidates, limit), ranking: "heuristic" };
  }
}

// ============================================================================
// DEFAULT FETCHERS (impure)
// ============================================================================

/**
 * Race a promise against a timeout, resolving to `fallback` if the budget
 * elapses first. Bounds calls whose underlying transport takes no abort signal
 * (the dangling work is abandoned, not awaited). Never rejects on timeout.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function defaultFetchOfficialIndex(style?: string): Promise<RegistryIndexItem[]> {
  try {
    const index = await withTimeout(fetchRegistryIndex(style), OFFICIAL_FETCH_TIMEOUT_MS, null);
    return index && Array.isArray(index.items) ? index.items : [];
  } catch (err) {
    debugLog("shadcn-describe", "official index fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

function buildCommunityItemUrl(urlTemplate: string, name: string): string {
  return urlTemplate.replace("{name}", encodeURIComponent(name));
}

export function makeDefaultFetchItem(
  communityRegistries: CommunityRegistryDescriptor[],
): DescribeDeps["fetchItem"] {
  const byNamespace = new Map(communityRegistries.map((r) => [r.namespace, r]));
  return async ({ registry, name, style }) => {
    if (registry === OFFICIAL_REGISTRY) {
      try {
        // Forward the requested style so hydrated deps/registryDependencies
        // come from the SAME style as the index hit + preview PNGs. Bounded so a
        // stuck upstream can't hold the route open until maxDuration — official
        // hits survive a null hydrate (they are real index entries).
        return await withTimeout(
          fetchRegistryItem(name, style),
          OFFICIAL_FETCH_TIMEOUT_MS,
          null,
        );
      } catch {
        return null;
      }
    }
    const descriptor = byNamespace.get(registry);
    if (!descriptor) return null;
    const url = buildCommunityItemUrl(descriptor.urlTemplate, name);
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(COMMUNITY_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const item = (await response.json()) as ShadcnRegistryItem;
      // Parity with the official path: a 200 with an empty/garbage body (e.g.
      // an error page serialized as JSON) must NOT surface as a real hit.
      return isUsableRegistryItem(item) ? item : null;
    } catch {
      return null;
    }
  };
}

function buildDefaultDeps(): DescribeDeps {
  const communityRegistries = loadDescribeCommunityRegistries();
  return {
    generateQueries: generateQueriesWithLlm,
    rankCandidates: rankCandidatesWithLlm,
    fetchOfficialIndex: defaultFetchOfficialIndex,
    fetchItem: makeDefaultFetchItem(communityRegistries),
    communityRegistries,
  };
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(limit)));
}

async function searchAndHydrate(
  queries: string[],
  deps: DescribeDeps,
  indexItems: RegistryIndexItem[],
  style?: string,
): Promise<DescribeCandidate[]> {
  const official = matchOfficialIndex(indexItems, queries);
  const community = matchCommunityItems(deps.communityRegistries, queries);
  const matched = [...official, ...community]
    .sort((a, b) => b.score - a.score)
    .slice(0, HYDRATE_CAP);

  const hydrated = await Promise.all(
    matched.map(async (ref) => {
      const item = await deps.fetchItem({ registry: ref.registry, name: ref.name, style });
      // Community items MUST verify (their existence is only a seed guess).
      // Official items survive a failed hydrate (they are real index entries).
      if (!item && ref.registry !== OFFICIAL_REGISTRY) return null;
      return toCandidate(ref, item, style);
    }),
  );

  // De-dupe by registry+name (an official item can also match multiple queries).
  const seen = new Set<string>();
  const candidates: DescribeCandidate[] = [];
  for (const candidate of hydrated) {
    if (!candidate) continue;
    const key = `${candidate.registry}/${candidate.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return candidates;
}

/**
 * Run the full "Beskriv" chain: sentence → queries → search official +
 * community → (retry with simplified queries on 0 hits) → rank real hits.
 * Reads registries only — writes nothing to the user site.
 */
export async function describeComponents(
  input: DescribeInput,
  depsOverride?: Partial<DescribeDeps>,
): Promise<DescribeResult> {
  const description = input.description.trim();
  const limit = clampLimit(input.limit);
  const deps: DescribeDeps = { ...buildDefaultDeps(), ...depsOverride };

  const indexItems = await deps.fetchOfficialIndex(input.style);

  let queries = await deps.generateQueries(description);
  let usedFallbackQueries = false;
  let candidates = await searchAndHydrate(queries, deps, indexItems, input.style);

  if (candidates.length === 0) {
    const simplified = simplifyQueries(queries, description);
    if (simplified.length > 0) {
      queries = simplified;
      usedFallbackQueries = true;
      candidates = await searchAndHydrate(queries, deps, indexItems, input.style);
    }
  }

  const { candidates: ranked, ranking } = await deps.rankCandidates(
    description,
    candidates,
    limit,
  );

  debugLog("shadcn-describe", "describe complete", {
    queries,
    usedFallbackQueries,
    ranking,
    candidateCount: ranked.length,
  });

  return { candidates: ranked, queries, usedFallbackQueries, ranking };
}
