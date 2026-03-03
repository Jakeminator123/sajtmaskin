import OpenAI from "openai";
import { SECRETS } from "@/lib/config";
import {
  getTemplateCatalog,
  type TemplateCatalogItem,
} from "@/lib/templates/template-catalog";

const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_TOP_K = 5;

interface EmbeddingEntry {
  id: string;
  embedding: number[];
}

interface EmbeddingsFile {
  _meta: { model: string; dimensions: number; generated: string; count: number };
  embeddings: EmbeddingEntry[];
}

// In-memory cache — loaded once per process lifetime
let cachedEmbeddings: EmbeddingEntry[] | null = null;
let catalogLookup: Map<string, TemplateCatalogItem> | null = null;

function loadEmbeddings(): EmbeddingEntry[] {
  if (cachedEmbeddings) return cachedEmbeddings;

  try {
    // Dynamic require to load the JSON at runtime (not bundled by webpack)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data: EmbeddingsFile = require("./template-embeddings.json");
    cachedEmbeddings = data.embeddings ?? [];
  } catch {
    cachedEmbeddings = [];
  }

  return cachedEmbeddings;
}

function getCatalogLookup(): Map<string, TemplateCatalogItem> {
  if (catalogLookup) return catalogLookup;

  catalogLookup = new Map<string, TemplateCatalogItem>();
  for (const item of getTemplateCatalog()) {
    catalogLookup.set(item.id, item);
  }
  return catalogLookup;
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

/**
 * Semantic template search using pre-computed embeddings.
 *
 * 1. Loads cached template embeddings from JSON (once per process)
 * 2. Embeds the query string via OpenAI
 * 3. Ranks templates by cosine similarity
 * 4. Returns top K results as TemplateCatalogItem[]
 *
 * Returns empty array if:
 * - No OPENAI_API_KEY configured
 * - Embeddings file doesn't exist / is empty
 * - API call fails
 */
export async function searchTemplates(
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<TemplateCatalogItem[]> {
  const apiKey = SECRETS.openaiApiKey;
  if (!apiKey) return [];

  const embeddings = loadEmbeddings();
  if (embeddings.length === 0) return [];

  const openai = new OpenAI({ apiKey });

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
    dimensions: 1536,
  });

  const queryEmbedding = response.data[0].embedding;

  const scored = embeddings.map((entry) => ({
    id: entry.id,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  const lookup = getCatalogLookup();
  const results: TemplateCatalogItem[] = [];

  for (const { id } of scored) {
    if (results.length >= topK) break;
    const item = lookup.get(id);
    if (item) results.push(item);
  }

  return results;
}

/**
 * Force-reload embeddings from disk. Useful after regenerating.
 */
export function invalidateEmbeddingsCache(): void {
  cachedEmbeddings = null;
  catalogLookup = null;
}
