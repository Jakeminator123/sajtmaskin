import OpenAI from "openai";
import { SECRETS } from "@/lib/config";
import { getScaffoldById } from "./registry";
import type { ScaffoldManifest } from "./types";
import type { ScaffoldEmbeddingEntry, ScaffoldEmbeddingsFile } from "./scaffold-embeddings-core";
import { SCAFFOLD_EMBEDDING_MODEL, SCAFFOLD_EMBEDDING_DIMENSIONS } from "./scaffold-embeddings-core";

export interface ScaffoldSearchResult {
  scaffold: ScaffoldManifest;
  score: number;
}

export type ScaffoldSearchUnavailableReason =
  | "missing_api_key"
  | "missing_embeddings"
  | "request_failed"
  | "registry_mismatch";

export interface ScaffoldSearchDiagnostics {
  attempted: boolean;
  available: boolean;
  failed: boolean;
  unavailableReason: ScaffoldSearchUnavailableReason | null;
  errorMessage: string | null;
  durationMs: number | null;
}

export interface ScaffoldSearchResponse {
  results: ScaffoldSearchResult[];
  diagnostics: ScaffoldSearchDiagnostics;
}

let cachedEmbeddings: ScaffoldEmbeddingEntry[] | null = null;
const EMBEDDING_TIMEOUT_MS = 5_000;

function createEmbeddingAbortSignal(): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") {
    return undefined;
  }
  return AbortSignal.timeout(EMBEDDING_TIMEOUT_MS);
}

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

/** Swedish / mixed prompts → English retrieval terms */
const SWEDISH_TO_ENGLISH_HINTS: Array<{ match: RegExp; hint: string }> = [
  { match: /\b(hemsida|webbplats|sajt|nätet)\b/i, hint: "website web landing homepage" },
  { match: /\b(landningssida|startsida|företagssida)\b/i, hint: "landing page marketing company" },
  { match: /\b(restaurang|meny)\b/i, hint: "restaurant food dining menu" },
  { match: /\b(bokning|boka)\b/i, hint: "booking reservation appointment" },
  { match: /\b(konferens|bröllop|festival)\b/i, hint: "event conference wedding" },
  { match: /\b(förening|ideell|välgörenhet)\b/i, hint: "nonprofit charity organization" },
  { match: /\b(butik|e-handel|webshop|handla)\b/i, hint: "ecommerce shop store products cart" },
  { match: /\b(blogg|artikel|inlägg)\b/i, hint: "blog articles posts editorial" },
  { match: /\b(fotograf|designer|kreatör|konsult)\b/i, hint: "portfolio creative showcase personal" },
  { match: /\b(saas|abonnemang|prenumeration|prislista)\b/i, hint: "saas platform subscription pricing" },
  { match: /\b(inloggning|registrering|konto|lösenord)\b/i, hint: "authentication login signup auth" },
  { match: /\b(instrumentpanel|statistik|diagram)\b/i, hint: "dashboard analytics metrics admin" },
  { match: /\b(app|applikation|adminpanel)\b/i, hint: "app application admin panel shell" },
  { match: /\b(mall|mallar|template)\b/i, hint: "template starter scaffold" },
];

/** English prompts → Swedish retrieval terms (same bilingual index) */
const ENGLISH_TO_SWEDISH_HINTS: Array<{ match: RegExp; hint: string }> = [
  { match: /\b(website|web site|homepage|landing)\b/i, hint: "webbplats landningssida startsida hemsida" },
  { match: /\b(shop|store|ecommerce|e-commerce|cart)\b/i, hint: "butik e-handel webshop varukorg" },
  { match: /\b(blog|article|post|editorial)\b/i, hint: "blogg artikel inlägg redaktionell" },
  { match: /\b(portfolio|showcase|creative)\b/i, hint: "portfolio fotograf designer kreatör" },
  { match: /\b(saas|subscription|pricing|b2b)\b/i, hint: "saas prenumeration prissättning plattform" },
  { match: /\b(login|signup|sign up|auth|password)\b/i, hint: "inloggning registrering konto lösenord" },
  { match: /\b(dashboard|analytics|metrics|admin)\b/i, hint: "instrumentpanel statistik analys admin" },
  { match: /\b(template|starter|scaffold)\b/i, hint: "mall startmall grund" },
];

function expandQuery(query: string): string {
  const hints = [
    ...SWEDISH_TO_ENGLISH_HINTS.filter(({ match }) => match.test(query)).map(({ hint }) => hint),
    ...ENGLISH_TO_SWEDISH_HINTS.filter(({ match }) => match.test(query)).map(({ hint }) => hint),
  ];
  if (hints.length === 0) return query;
  return `${query}\n\nRelated search terms: ${Array.from(new Set(hints)).join(", ")}`;
}

/**
 * Semantic scaffold search using pre-computed embeddings.
 * Returns the best-matching scaffold or null if no embeddings or API key available.
 */
export async function searchScaffolds(
  query: string,
  topK: number = 3,
): Promise<ScaffoldSearchResult[]> {
  const { results } = await searchScaffoldsWithDiagnostics(query, topK);
  return results;
}

export async function searchScaffoldsWithDiagnostics(
  query: string,
  topK: number = 3,
): Promise<ScaffoldSearchResponse> {
  const apiKey = SECRETS.openaiApiKey;
  if (!apiKey) {
    return {
      results: [],
      diagnostics: {
        attempted: false,
        available: false,
        failed: false,
        unavailableReason: "missing_api_key",
        errorMessage: null,
        durationMs: null,
      },
    };
  }

  const embeddings = loadEmbeddings();
  if (embeddings.length === 0) {
    return {
      results: [],
      diagnostics: {
        attempted: false,
        available: false,
        failed: false,
        unavailableReason: "missing_embeddings",
        errorMessage: null,
        durationMs: null,
      },
    };
  }

  const openai = new OpenAI({ apiKey });
  const embeddingStartedAt = Date.now();
  const embeddingSignal = createEmbeddingAbortSignal();

  let queryEmbedding: number[];
  try {
    const response = await openai.embeddings.create({
      model: SCAFFOLD_EMBEDDING_MODEL,
      input: expandQuery(query),
      dimensions: SCAFFOLD_EMBEDDING_DIMENSIONS,
    }, embeddingSignal ? { signal: embeddingSignal } : undefined);
    if (!response.data?.[0]?.embedding) {
      return {
        results: [],
        diagnostics: {
          attempted: true,
          available: false,
          failed: true,
          unavailableReason: "request_failed",
          errorMessage: "Embedding API returned empty data",
          durationMs: Date.now() - embeddingStartedAt,
        },
      };
    }
    queryEmbedding = response.data[0].embedding;
    console.debug("[scaffold-search] Embedding query completed", {
      durationMs: Date.now() - embeddingStartedAt,
      topK,
      queryChars: query.length,
    });
  } catch (err) {
    console.warn("[scaffold-search] Embedding API call failed", {
      message: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - embeddingStartedAt,
      timeoutMs: EMBEDDING_TIMEOUT_MS,
      queryChars: query.length,
    });
    return {
      results: [],
      diagnostics: {
        attempted: true,
        available: false,
        failed: true,
        unavailableReason: "request_failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - embeddingStartedAt,
      },
    };
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

  const unmappedIds = scored.length > 0 && results.length === 0;

  return {
    results,
    diagnostics: {
      attempted: true,
      available: !unmappedIds,
      failed: false,
      unavailableReason: unmappedIds ? "registry_mismatch" : null,
      errorMessage: unmappedIds ? "All scored IDs missing from scaffold registry — embedding file may be stale" : null,
      durationMs: Date.now() - embeddingStartedAt,
    },
  };
}

export function invalidateScaffoldEmbeddingsCache(): void {
  cachedEmbeddings = null;
}
