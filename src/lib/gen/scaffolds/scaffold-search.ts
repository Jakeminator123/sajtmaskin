import OpenAI from "openai";
import { SECRETS } from "@/lib/config";
import { getAllScaffolds, getScaffoldById } from "./registry";
import type { ScaffoldManifest } from "./types";
import type { ScaffoldEmbeddingEntry, ScaffoldEmbeddingsFile } from "./scaffold-embeddings-core";
import { SCAFFOLD_EMBEDDING_MODEL, SCAFFOLD_EMBEDDING_DIMENSIONS } from "./scaffold-embeddings-core";

export interface ScaffoldSearchResult {
  scaffold: ScaffoldManifest;
  score: number;
}

let cachedEmbeddings: ScaffoldEmbeddingEntry[] | null = null;

function loadEmbeddings(): ScaffoldEmbeddingEntry[] {
  if (cachedEmbeddings) return cachedEmbeddings;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data: ScaffoldEmbeddingsFile = require("./scaffold-embeddings.json");
    cachedEmbeddings = data.embeddings ?? [];
  } catch {
    cachedEmbeddings = [];
  }
  return cachedEmbeddings;
}

function cosineSimilarity(a: number[], b: number[]): number {
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

const QUERY_HINTS: Array<{ match: RegExp; hint: string }> = [
  { match: /\b(restaurang|restaurant|meny|menu)\b/i, hint: "restaurant food dining menu" },
  { match: /\b(bokning|booking|boka|appointment)\b/i, hint: "booking reservation appointment" },
  { match: /\b(event|konferens|bröllop|festival)\b/i, hint: "event conference wedding" },
  { match: /\b(förening|ideell|nonprofit|välgörenhet)\b/i, hint: "nonprofit charity organization" },
  { match: /\b(butik|shop|e-handel|webshop)\b/i, hint: "ecommerce shop store products" },
  { match: /\b(blogg|blog|artikel|inlägg)\b/i, hint: "blog articles posts editorial" },
  { match: /\b(portfolio|fotograf|designer|kreatör)\b/i, hint: "portfolio creative showcase" },
  { match: /\b(saas|plattform|abonnemang|pricing)\b/i, hint: "saas platform subscription" },
  { match: /\b(login|inloggning|registrering|auth)\b/i, hint: "authentication login signup" },
  { match: /\b(dashboard|instrumentpanel|statistik)\b/i, hint: "dashboard analytics metrics" },
];

function expandQuery(query: string): string {
  const hints = QUERY_HINTS
    .filter(({ match }) => match.test(query))
    .map(({ hint }) => hint);
  if (hints.length === 0) return query;
  return `${query}\n\nRelated: ${Array.from(new Set(hints)).join(", ")}`;
}

/**
 * Semantic scaffold search using pre-computed embeddings.
 * Returns the best-matching scaffold or null if no embeddings or API key available.
 */
export async function searchScaffolds(
  query: string,
  topK: number = 3,
): Promise<ScaffoldSearchResult[]> {
  const apiKey = SECRETS.openaiApiKey;
  if (!apiKey) return [];

  const embeddings = loadEmbeddings();
  if (embeddings.length === 0) return [];

  const openai = new OpenAI({ apiKey });

  let queryEmbedding: number[];
  try {
    const response = await openai.embeddings.create({
      model: SCAFFOLD_EMBEDDING_MODEL,
      input: expandQuery(query),
      dimensions: SCAFFOLD_EMBEDDING_DIMENSIONS,
    });
    queryEmbedding = response.data[0].embedding;
  } catch (err) {
    console.error("[scaffold-search] Embedding API call failed:", err);
    return [];
  }

  const scored = embeddings
    .map((entry) => ({
      id: entry.id,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }))
    .filter(({ score }) => Number.isFinite(score) && score > 0)
    .sort((a, b) => b.score - a.score);

  const results: ScaffoldSearchResult[] = [];
  for (const { id, score } of scored) {
    if (results.length >= topK) break;
    const scaffold = getScaffoldById(id);
    if (scaffold) results.push({ scaffold, score });
  }

  return results;
}

export function invalidateScaffoldEmbeddingsCache(): void {
  cachedEmbeddings = null;
}
