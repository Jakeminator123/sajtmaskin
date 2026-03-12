import OpenAI from "openai";
import { SECRETS } from "@/lib/config";
import { getTemplateLibraryEntries } from "./catalog";
import type {
  TemplateLibraryEmbeddingsFile,
  TemplateLibraryEmbeddingEntry,
} from "./embeddings-core";
import type {
  TemplateLibraryEntry,
  TemplateLibrarySearchResult,
  TemplateLibrarySelectedFile,
} from "./types";

const DEFAULT_TOP_K = 3;
const MIN_EMBEDDING_SCORE = 0.3;
const DEFAULT_MAX_REFERENCE_FILES = 2;
const DEFAULT_MAX_EXCERPT_CHARS = 900;
const DEFAULT_MAX_TOTAL_CHARS = 1800;
const STOPWORDS = new Set([
  "en", "ett", "och", "med", "som", "för", "att", "jag", "vill", "ha", "den", "det", "är", "ska",
  "a", "an", "the", "and", "with", "for", "that", "this", "is", "it", "to", "of", "in", "my", "me",
  "template", "templates", "scaffold", "scaffolds", "build", "create", "website", "webbplats",
]);

let cachedEmbeddings: TemplateLibraryEmbeddingEntry[] | null = null;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function keywordScore(query: string, entry: TemplateLibraryEntry): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;

  const haystack = normalize([
    entry.title,
    entry.categoryName,
    entry.description,
    entry.summary,
    entry.stackTags.join(" "),
    entry.strengths.join(" "),
    entry.recommendedScaffoldFamilies.join(" "),
  ].join(" "));

  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += token.length >= 6 ? 1.2 : 1;
  }

  return score;
}

function keywordSearch(query: string, topK: number): TemplateLibrarySearchResult[] {
  return getTemplateLibraryEntries()
    .map((entry) => ({ entry, score: keywordScore(query, entry) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.entry.qualityScore - a.entry.qualityScore;
    })
    .slice(0, topK);
}

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

export async function searchTemplateLibrary(
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<TemplateLibrarySearchResult[]> {
  const fallbackResults = keywordSearch(query, topK);
  const apiKey = SECRETS.openaiApiKey;
  if (!apiKey) return fallbackResults;

  const embeddings = loadEmbeddings();
  if (embeddings.length === 0) return fallbackResults;

  let queryEmbedding: number[];
  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      dimensions: 1536,
    });
    queryEmbedding = response.data[0].embedding;
  } catch {
    return fallbackResults;
  }

  const entryLookup = new Map(getTemplateLibraryEntries().map((entry) => [entry.id, entry]));
  const results = embeddings
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

  if (results.length > 0) return results;
  return fallbackResults;
}
