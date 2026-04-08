import OpenAI from "openai";
import { FEATURES, SECRETS } from "@/lib/config";
import { debugLog } from "@/lib/utils/debug";
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
/** Below this, blend in keyword hits so weak semantic matches do not dominate. */
const WEAK_EMBEDDING_TOP_SCORE = 0.4;
const DEFAULT_MAX_REFERENCE_FILES = 20;
const DEFAULT_MAX_EXCERPT_CHARS = 9_000;
const DEFAULT_MAX_TOTAL_CHARS = 18_000;
/** First slice keeps a larger cap so ranking does not zero out all code context. */
const FIRST_FILE_EXCERPT_FLOOR = 1_400;
const EMBEDDING_TIMEOUT_MS = 3_000;
const STOPWORDS = new Set([
  "en", "ett", "och", "med", "som", "för", "att", "jag", "vill", "ha", "den", "det", "är", "ska",
  "a", "an", "the", "and", "with", "for", "that", "this", "is", "it", "to", "of", "in", "my", "me",
  "template", "templates", "scaffold", "scaffolds", "build", "create", "website", "webbplats",
]);

let cachedEmbeddings: TemplateLibraryEmbeddingEntry[] | null = null;

function createEmbeddingAbortSignal(): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") {
    return undefined;
  }
  return AbortSignal.timeout(EMBEDDING_TIMEOUT_MS);
}

export interface TemplateLibrarySearchDiagnostics {
  mode:
    | "empty_catalog"
    | "embedding"
    | "hybrid_keyword_blend"
    | "keyword_fallback"
    | "keyword_only";
  catalogSize: number;
  usedEmbeddings: boolean;
  reason?:
    | "embedding_query_failed"
    | "missing_api_key"
    | "missing_embeddings"
    | "embeddings_id_mismatch"
    | "no_embedding_hits"
    | "weak_embedding_match";
  topScore?: number;
}

export interface TemplateLibrarySearchResponse {
  results: TemplateLibrarySearchResult[];
  diagnostics: TemplateLibrarySearchDiagnostics;
}

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
    entry.classification.useCaseTags.join(" "),
    entry.classification.siteFormTags.join(" "),
    entry.classification.technicalPatternTags.join(" "),
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
    const cap =
      selected.length === 0
        ? Math.max(maxExcerptChars, Math.min(FIRST_FILE_EXCERPT_FLOOR, maxTotalChars))
        : maxExcerptChars;
    const excerpt = trimExcerpt(file.excerpt, cap);
    if (!excerpt.trim()) continue;
    const nextTotal = totalChars + excerpt.length;
    if (selected.length > 0 && nextTotal > maxTotalChars) break;

    selected.push({
      ...file,
      excerpt,
    });
    totalChars = nextTotal;
  }

  // Guarantee at least one non-empty slice when the dossier has any excerpt material.
  if (selected.length === 0 && entry.selectedFiles?.length) {
    for (const file of entry.selectedFiles) {
      const raw = typeof file.excerpt === "string" ? file.excerpt.trim() : "";
      if (!raw) continue;
      const excerpt = trimExcerpt(raw, Math.min(FIRST_FILE_EXCERPT_FLOOR, maxTotalChars));
      if (excerpt.trim()) {
        selected.push({ ...file, excerpt });
      }
      break;
    }
  }

  return selected;
}

/** Keyword-only search (no OpenAI embeddings). Used for offline CLI traces. */
export function searchTemplateLibraryKeywordsOnly(
  query: string,
  topK: number = DEFAULT_TOP_K,
): TemplateLibrarySearchResult[] {
  return keywordSearch(query, topK);
}

export async function searchTemplateLibraryWithDiagnostics(
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<TemplateLibrarySearchResponse> {
  const catalogEntries = getTemplateLibraryEntries();
  const catalogSize = catalogEntries.length;
  // Stale template-library-embeddings.json must not load, call OpenAI, or rank
  // phantom IDs when curated entries[] is empty (common after catalog resets).
  if (catalogSize === 0) {
    if (FEATURES.strictGeneratedArtifacts) {
      throw new Error(
        "[template-library] Generated catalog is empty. Rebuild template-library.generated.json before generation.",
      );
    }
    return {
      results: [],
      diagnostics: {
        mode: "empty_catalog",
        catalogSize,
        usedEmbeddings: false,
      },
    };
  }

  const fallbackResults = keywordSearch(query, topK);
  const apiKey = SECRETS.openaiApiKey;
  if (!apiKey) {
    return {
      results: fallbackResults,
      diagnostics: {
        mode: "keyword_fallback",
        catalogSize,
        usedEmbeddings: false,
        reason: "missing_api_key",
      },
    };
  }

  const embeddings = loadEmbeddings();
  if (embeddings.length === 0) {
    if (FEATURES.strictGeneratedArtifacts) {
      throw new Error(
        "[template-library] Missing template-library embeddings while catalog has entries. Run template-library:embeddings.",
      );
    }
    return {
      results: fallbackResults,
      diagnostics: {
        mode: "keyword_fallback",
        catalogSize,
        usedEmbeddings: false,
        reason: "missing_embeddings",
      },
    };
  }
  const catalogIds = new Set(catalogEntries.map((entry) => entry.id));
  const embeddingIds = new Set(embeddings.map((entry) => entry.id));
  const missingEmbeddings = [...catalogIds].filter((id) => !embeddingIds.has(id));
  const orphanEmbeddings = [...embeddingIds].filter((id) => !catalogIds.has(id));
  if (missingEmbeddings.length > 0 || orphanEmbeddings.length > 0) {
    if (FEATURES.strictGeneratedArtifacts) {
      const missingSample = missingEmbeddings.slice(0, 4).join(", ");
      const orphanSample = orphanEmbeddings.slice(0, 4).join(", ");
      throw new Error(
        `[template-library] Embedding id mismatch. ` +
          `Missing: ${missingEmbeddings.length}${missingSample ? ` (${missingSample})` : ""}; ` +
          `Orphan: ${orphanEmbeddings.length}${orphanSample ? ` (${orphanSample})` : ""}. ` +
          `Rebuild template-library artifacts.`,
      );
    }
    return {
      results: fallbackResults,
      diagnostics: {
        mode: "keyword_fallback",
        catalogSize,
        usedEmbeddings: false,
        reason: "embeddings_id_mismatch",
      },
    };
  }

  // text-embedding-3-small has an 8192-token limit. For template matching we
  // only need the topic/intent, not verbose follow-up instructions, so cap at
  // ~6k chars (~1500 tokens) which is more than enough for semantic similarity.
  const EMBEDDING_QUERY_CHAR_LIMIT = 6_000;
  const embeddingInput =
    query.length > EMBEDDING_QUERY_CHAR_LIMIT
      ? query.slice(0, EMBEDDING_QUERY_CHAR_LIMIT)
      : query;

  let queryEmbedding: number[];
  const embeddingStartedAt = Date.now();
  const embeddingSignal = createEmbeddingAbortSignal();
  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: embeddingInput,
      dimensions: 1536,
    }, embeddingSignal ? { signal: embeddingSignal } : undefined);
    queryEmbedding = response.data[0].embedding;
    debugLog("template-library", "Embedding query completed", {
      durationMs: Date.now() - embeddingStartedAt,
      queryChars: embeddingInput.length,
      catalogSize,
    });
  } catch (err) {
    debugLog("template-library", "Embedding query failed; using keyword fallback", {
      message: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - embeddingStartedAt,
      timeoutMs: EMBEDDING_TIMEOUT_MS,
      queryChars: embeddingInput.length,
    });
    return {
      results: fallbackResults,
      diagnostics: {
        mode: "keyword_fallback",
        catalogSize,
        usedEmbeddings: true,
        reason: "embedding_query_failed",
      },
    };
  }

  const entryLookup = new Map(catalogEntries.map((entry) => [entry.id, entry]));
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

  if (results.length > 0) {
    const topScore = results[0]!.score;
    if (topScore < WEAK_EMBEDDING_TOP_SCORE && fallbackResults.length > 0) {
      debugLog("template-library", "Weak embedding match; blending keyword results", {
        topScore,
        keywordCount: fallbackResults.length,
      });
      const merged: TemplateLibrarySearchResult[] = [...results];
      const seen = new Set(merged.map((r) => r.entry.id));
      for (const fr of fallbackResults) {
        if (seen.has(fr.entry.id)) continue;
        merged.push({ entry: fr.entry, score: fr.score * 0.12 });
        seen.add(fr.entry.id);
        if (merged.length >= topK * 3) break;
      }
      return {
        results: merged
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.entry.qualityScore - a.entry.qualityScore;
          })
          .slice(0, topK),
        diagnostics: {
          mode: "hybrid_keyword_blend",
          catalogSize,
          usedEmbeddings: true,
          reason: "weak_embedding_match",
          topScore,
        },
      };
    }
    return {
      results,
      diagnostics: {
        mode: "embedding",
        catalogSize,
        usedEmbeddings: true,
        topScore,
      },
    };
  }
  debugLog("template-library", "No embedding hits above threshold; using keyword fallback", {
    minScore: MIN_EMBEDDING_SCORE,
  });
  return {
    results: fallbackResults,
    diagnostics: {
      mode: "keyword_fallback",
      catalogSize,
      usedEmbeddings: true,
      reason: "no_embedding_hits",
    },
  };
}

export async function searchTemplateLibrary(
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<TemplateLibrarySearchResult[]> {
  const { results } = await searchTemplateLibraryWithDiagnostics(query, topK);
  return results;
}
