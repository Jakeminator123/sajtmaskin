import OpenAI from "openai";
import { SECRETS } from "@/lib/config";
import {
  getTemplateCatalog,
  type TemplateCatalogItem,
} from "@/lib/templates/template-catalog";
import type {
  EmbeddingEntry,
  EmbeddingsFile,
} from "@/lib/templates/template-embeddings-core";
import {
  loadTemplateEmbeddingsFromBlob,
  resolveTemplateEmbeddingsStorageMode,
} from "@/lib/templates/template-embeddings-storage";

const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_TOP_K = 5;
const QUERY_HINTS: Array<{ match: RegExp; hint: string }> = [
  { match: /\b(hemsida|webbplats|sajt)\b/i, hint: "website" },
  { match: /\b(mall|mallar|template|templates)\b/i, hint: "template" },
  { match: /\b(inloggning|registrering|konto)\b/i, hint: "login signup auth" },
  { match: /\b(app|appar|spel|game)\b/i, hint: "apps and games" },
  { match: /\b(blogg|portfolio)\b/i, hint: "blog portfolio" },
];

// In-memory cache — loaded once per process lifetime
let cachedEmbeddings: EmbeddingEntry[] | null = null;
let loadingEmbeddingsPromise: Promise<EmbeddingEntry[]> | null = null;
let catalogLookup: Map<string, TemplateCatalogItem> | null = null;

function loadLocalEmbeddingsFromFile(): EmbeddingEntry[] {
  try {
    // Dynamic require to load the JSON at runtime (not bundled by webpack)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data: EmbeddingsFile = require("./template-embeddings.json");
    return data.embeddings ?? [];
  } catch {
    return [];
  }
}

async function loadEmbeddings(): Promise<EmbeddingEntry[]> {
  if (cachedEmbeddings) return cachedEmbeddings;
  if (loadingEmbeddingsPromise) return loadingEmbeddingsPromise;

  loadingEmbeddingsPromise = (async () => {
    try {
      if (resolveTemplateEmbeddingsStorageMode() === "blob") {
        const remote = await loadTemplateEmbeddingsFromBlob();
        if (remote?.embeddings?.length) {
          cachedEmbeddings = remote.embeddings;
          return cachedEmbeddings;
        }
      }

      cachedEmbeddings = loadLocalEmbeddingsFromFile();
      return cachedEmbeddings;
    } finally {
      loadingEmbeddingsPromise = null;
    }
  })();

  try {
    return await loadingEmbeddingsPromise;
  } catch {
    cachedEmbeddings = loadLocalEmbeddingsFromFile();
    return cachedEmbeddings;
  }
}

function getCatalogLookup(): Map<string, TemplateCatalogItem> {
  if (catalogLookup) return catalogLookup;

  catalogLookup = new Map<string, TemplateCatalogItem>();
  for (const item of getTemplateCatalog()) {
    catalogLookup.set(item.id, item);
  }
  return catalogLookup;
}

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandQueryForEmbeddings(query: string): string {
  const normalized = normalizeForSearch(query);
  const hints = QUERY_HINTS
    .filter(({ match }) => match.test(normalized))
    .map(({ hint }) => hint);

  if (hints.length === 0) return query;
  const uniqueHints = Array.from(new Set(hints)).join(", ");
  return `${query}\n\nRelated search terms: ${uniqueHints}`;
}

function keywordSimilarity(query: string, item: TemplateCatalogItem): number {
  const q = normalizeForSearch(query);
  if (!q) return 0;

  const haystack = normalizeForSearch(`${item.title} ${item.category}`);
  if (!haystack) return 0;

  const tokens = Array.from(new Set(q.split(" ").filter((token) => token.length >= 2)));
  if (tokens.length === 0) return haystack.includes(q) ? 0.6 : 0;

  let totalWeight = 0;
  let matchedWeight = 0;

  for (const token of tokens) {
    const weight = token.length >= 6 ? 1.2 : 1;
    totalWeight += weight;
    if (haystack.includes(token)) matchedWeight += weight;
  }

  let score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  if (haystack.includes(q)) score = Math.max(score, 0.98);
  return Math.min(0.99, score);
}

function fallbackKeywordSearch(query: string, topK: number): TemplateSearchResult[] {
  const catalog = getTemplateCatalog();
  return catalog
    .map((template) => ({
      template,
      score: keywordSimilarity(query, template),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface TemplateSearchResult {
  template: TemplateCatalogItem;
  score: number;
}

/**
 * Semantic template search using pre-computed embeddings.
 *
 * 1. Loads cached template embeddings from blob/local JSON (once per process)
 * 2. Embeds the query string via OpenAI
 * 3. Ranks templates by cosine similarity
 * 4. Returns top K results with scores
 */
export async function searchTemplates(
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<TemplateSearchResult[]> {
  const fallbackResults = fallbackKeywordSearch(query, topK);

  const apiKey = SECRETS.openaiApiKey;
  if (!apiKey) return fallbackResults;

  const embeddings = await loadEmbeddings();
  if (embeddings.length === 0) return fallbackResults;

  const openai = new OpenAI({ apiKey });

  let queryEmbedding: number[];
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: expandQueryForEmbeddings(query),
      dimensions: 1536,
    });
    queryEmbedding = response.data[0].embedding;
  } catch (err) {
    console.error("[template-search] Embedding API call failed:", err);
    return fallbackResults;
  }

  const scored = embeddings.map((entry) => ({
    id: entry.id,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }))
    .filter(({ score }) => Number.isFinite(score) && score > 0);

  scored.sort((a, b) => b.score - a.score);

  const lookup = getCatalogLookup();
  const results: TemplateSearchResult[] = [];

  for (const { id, score } of scored) {
    if (results.length >= topK) break;
    const item = lookup.get(id);
    if (item) results.push({ template: item, score });
  }

  if (results.length >= topK || fallbackResults.length === 0) {
    return results;
  }

  const seenIds = new Set(results.map((item) => item.template.id));
  for (const candidate of fallbackResults) {
    if (results.length >= topK) break;
    if (seenIds.has(candidate.template.id)) continue;
    results.push(candidate);
    seenIds.add(candidate.template.id);
  }

  return results;
}

/**
 * Force-reload embeddings from disk. Useful after regenerating.
 */
export function invalidateEmbeddingsCache(): void {
  cachedEmbeddings = null;
  loadingEmbeddingsPromise = null;
  catalogLookup = null;
}
