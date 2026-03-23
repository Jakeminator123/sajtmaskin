import OpenAI from "openai";
import { SECRETS } from "@/lib/config";
import { getTemplateLibraryEntries } from "./catalog";
import type {
  TemplateLibraryEmbeddingsFile,
  TemplateLibraryEmbeddingEntry,
} from "./embeddings-core";
import {
  TEMPLATE_LIBRARY_EMBEDDING_MODEL,
  TEMPLATE_LIBRARY_EMBEDDING_DIMENSIONS,
} from "./embeddings-core";
import type {
  TemplateLibraryEntry,
  TemplateLibrarySearchResult,
  TemplateLibrarySelectedFile,
} from "./types";

const DEFAULT_TOP_K = 3;
const MIN_EMBEDDING_SCORE = 0.3;
const DEFAULT_MAX_REFERENCE_FILES = 20;
const DEFAULT_MAX_EXCERPT_CHARS = 9_000;
const DEFAULT_MAX_TOTAL_CHARS = 18_000;

let cachedEmbeddings: TemplateLibraryEmbeddingEntry[] | null = null;

function loadEmbeddings(): TemplateLibraryEmbeddingEntry[] {
  if (cachedEmbeddings) return cachedEmbeddings;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data: TemplateLibraryEmbeddingsFile = require("./template-library-embeddings.json");
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

function trimExcerpt(excerpt: string, maxChars: number): string {
  const normalized = excerpt.trim();
  if (normalized.length <= maxChars) return normalized;
  const slice = normalized.slice(0, maxChars);
  const lastFence = slice.lastIndexOf("```");
  const lastNewline = slice.lastIndexOf("\n");
  const safeEnd = Math.max(lastFence > maxChars - 12 ? -1 : lastFence, lastNewline);
  const trimmed = (safeEnd > 120 ? slice.slice(0, safeEnd) : slice).trimEnd();
  return `${trimmed}\n\n// ... truncated for prompt budget`;
}

export function selectTemplateReferenceFiles(
  entry: TemplateLibraryEntry,
  options?: {
    maxFiles?: number;
    maxExcerptChars?: number;
    maxTotalChars?: number;
  },
): TemplateLibrarySelectedFile[] {
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_REFERENCE_FILES;
  const maxExcerptChars = options?.maxExcerptChars ?? DEFAULT_MAX_EXCERPT_CHARS;
  const maxTotalChars = options?.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;

  let totalChars = 0;
  const selected: TemplateLibrarySelectedFile[] = [];

  for (const file of entry.selectedFiles) {
    if (selected.length >= maxFiles) break;
    const excerpt = trimExcerpt(file.excerpt, maxExcerptChars);
    const nextTotal = totalChars + excerpt.length;
    if (selected.length > 0 && nextTotal > maxTotalChars) break;

    selected.push({
      ...file,
      excerpt,
    });
    totalChars = nextTotal;
  }

  return selected;
}

/**
 * Search the template library using embedding similarity.
 * Returns an empty array when no API key or embeddings are available.
 */
export async function searchTemplateLibrary(
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<TemplateLibrarySearchResult[]> {
  const apiKey = SECRETS.openaiApiKey;
  if (!apiKey) return [];

  const embeddings = loadEmbeddings();
  if (embeddings.length === 0) return [];

  let queryEmbedding: number[];
  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.embeddings.create({
      model: TEMPLATE_LIBRARY_EMBEDDING_MODEL,
      input: query,
      dimensions: TEMPLATE_LIBRARY_EMBEDDING_DIMENSIONS,
    });
    queryEmbedding = response.data[0].embedding;
  } catch {
    return [];
  }

  const entryLookup = new Map(getTemplateLibraryEntries().map((entry) => [entry.id, entry]));
  return embeddings
    .map((entry) => ({
      entry: entryLookup.get(entry.id),
      score: entryLookup.has(entry.id) ? cosineSimilarity(queryEmbedding, entry.embedding) : 0,
    }))
    .filter((result): result is TemplateLibrarySearchResult => Boolean(result.entry) && result.score >= MIN_EMBEDDING_SCORE)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.entry.qualityScore - a.entry.qualityScore;
    })
    .slice(0, topK);
}
