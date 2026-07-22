/**
 * Registry Discovery — pure search/match helpers over shadcn registries
 * =====================================================================
 *
 * Deterministic, network-free fuzzy matching over registry data. Extracted
 * from `describe.ts` (Fas 1) so the generation-path resolver (Fas 4,
 * `src/lib/gen/data/shadcn-ui-recipes.ts`) can reuse the SAME search engine
 * without importing the describe orchestrator's LLM machinery. `describe.ts`
 * re-exports everything here, so its public surface is unchanged.
 *
 * Design constraints:
 * - Pure over provided data: callers fetch the index/items themselves.
 * - Deterministic: same input → same output (stable sorts, no randomness).
 * - Unicode-aware tokenization so Swedish prompts match correctly.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// TYPES
// ============================================================================

/** Built-in official registry namespace. Never declared in components.json. */
export const OFFICIAL_REGISTRY = "@shadcn";

/** Minimal shape of an official registry index entry used for matching. */
export interface SearchableIndexItem {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  categories?: string[];
}

/** A community registry the search layer can match + hydrate from. */
export interface CommunityRegistryDescriptor {
  namespace: string;
  /** URL template with a mandatory `{name}` placeholder. */
  urlTemplate: string;
  description?: string;
  /** Known item names (seeded from community-registries.json section maps). */
  itemNames: string[];
}

export interface MatchedRef {
  registry: string;
  name: string;
  title?: string;
  description?: string;
  score: number;
}

/** Max official index hits considered per search (before hydration). */
export const MAX_OFFICIAL_MATCHES = 12;
/** Max community hits considered per search (before hydration). */
export const MAX_COMMUNITY_MATCHES = 8;

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

export function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function scoreText(searchText: string, queryTokens: string[]): number {
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

function officialSearchText(item: SearchableIndexItem): string {
  return [item.name, item.title, item.description, ...(item.categories ?? [])]
    .filter(Boolean)
    .join(" ");
}

/**
 * Fuzzy-match the official registry index against the queries. Returns the
 * highest-scoring items (name/title/description/category token overlap).
 */
export function matchOfficialIndex(
  items: SearchableIndexItem[],
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
// COMMUNITY REGISTRY LOADING (impure, file-backed)
// ============================================================================

interface ComponentsJsonShape {
  registries?: Record<string, string | { url?: string }>;
}

export interface CommunitySeedEntry {
  namespace: string;
  url: string;
  maxPerGeneration?: number;
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

/**
 * Load the raw community seed entries (`config/community-registries.json`).
 * Used by the resolver for per-registry generation caps (`maxPerGeneration`).
 */
export function loadCommunitySeedEntries(): CommunitySeedEntry[] {
  return safeReadJson<CommunitySeedEntry[]>(COMMUNITY_REGISTRIES_PATH) ?? [];
}

// ============================================================================
// TIMEOUT BOUNDING
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
