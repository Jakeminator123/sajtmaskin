/**
 * Semantic search for docs snippets using precomputed embeddings.
 * Falls back gracefully to empty results if embeddings or API key are unavailable.
 */
import OpenAI from "openai";
import { SECRETS } from "@/lib/config";
import { DOCS_SNIPPETS, type DocSnippet } from "../data/docs-snippets";
import {
  DOCS_EMBEDDING_MODEL,
  DOCS_EMBEDDING_DIMENSIONS,
  type DocsEmbeddingEntry,
  type DocsEmbeddingsFile,
} from "../data/docs-embeddings-core";

export interface SemanticKBMatch {
  id: string;
  title: string;
  content: string;
  score: number;
  category: DocSnippet["category"];
}

let cachedEmbeddings: DocsEmbeddingEntry[] | null = null;

function loadEmbeddings(): DocsEmbeddingEntry[] {
  if (cachedEmbeddings) return cachedEmbeddings;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data: DocsEmbeddingsFile = require("../data/docs-embeddings.json");
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

export async function searchKnowledgeBaseSemantic(
  query: string,
  topK: number = 5,
  minScore: number = 0.35,
): Promise<SemanticKBMatch[]> {
  const apiKey = SECRETS.openaiApiKey;
  if (!apiKey) return [];

  const embeddings = loadEmbeddings();
  if (embeddings.length === 0) return [];

  const openai = new OpenAI({ apiKey });

  let queryEmbedding: number[];
  try {
    const response = await openai.embeddings.create({
      model: DOCS_EMBEDDING_MODEL,
      input: query,
      dimensions: DOCS_EMBEDDING_DIMENSIONS,
    });
    queryEmbedding = response.data[0].embedding;
  } catch {
    return [];
  }

  const snippetMap = new Map(DOCS_SNIPPETS.map((s) => [s.id, s]));

  const scored = embeddings
    .map((entry) => ({
      id: entry.id,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }))
    .filter(({ score }) => Number.isFinite(score) && score >= minScore)
    .sort((a, b) => b.score - a.score);

  const results: SemanticKBMatch[] = [];
  for (const { id, score } of scored) {
    if (results.length >= topK) break;
    const snippet = snippetMap.get(id);
    if (snippet) {
      results.push({
        id: snippet.id,
        title: snippet.title,
        content: snippet.content,
        score,
        category: snippet.category,
      });
    }
  }

  return results;
}

export function invalidateDocsEmbeddingsCache(): void {
  cachedEmbeddings = null;
}
