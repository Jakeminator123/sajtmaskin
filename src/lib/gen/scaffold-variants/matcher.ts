import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { getVariantsForScaffold } from "./registry";
import type { PickScaffoldVariantInput, ScaffoldVariant } from "./types";

function hashSeed(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return Math.abs(hash);
}

function scoreVariant(
  variant: ScaffoldVariant,
  promptLower: string,
  styleKeywordsLower: string[],
  toneKeywordsLower: string[],
): number {
  let score = variant.default ? 1 : 0;

  let keywordHits = 0;
  for (const keyword of variant.keywords) {
    const lower = keyword.toLowerCase();
    const wordBoundary = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^\\p{L}\\p{N}]|$)`,
      "iu",
    );
    if (wordBoundary.test(promptLower)) {
      keywordHits += 1;
      continue;
    }
    if (styleKeywordsLower.some((value) => value === lower || wordBoundary.test(value))) {
      keywordHits += 1;
      continue;
    }
    if (toneKeywordsLower.some((value) => value === lower || wordBoundary.test(value))) {
      keywordHits += 1;
    }
  }

  score += keywordHits * 3;
  if (keywordHits >= 2) score += keywordHits * 2;
  if (variant.colorMode === "dark" && /\b(dark|mörk|noir|black|svart|terminal)\b/i.test(promptLower)) {
    score += 2;
  }
  if (variant.colorMode === "light" && /\b(light|ljus|airy|clean|ren)\b/i.test(promptLower)) {
    score += 1;
  }

  return score;
}

export function pickScaffoldVariant(
  input: PickScaffoldVariantInput,
): ScaffoldVariant | null {
  const variants = getVariantsForScaffold(input.scaffoldId);
  if (variants.length === 0) return null;

  const promptLower = input.prompt.toLowerCase();
  const styleKeywordsLower = (input.styleKeywords ?? []).map((value) => value.toLowerCase());
  const toneKeywordsLower = (input.toneKeywords ?? []).map((value) => value.toLowerCase());

  const ranked = variants
    .map((variant) => ({
      variant,
      score: scoreVariant(variant, promptLower, styleKeywordsLower, toneKeywordsLower),
    }))
    .sort((a, b) => b.score - a.score || a.variant.id.localeCompare(b.variant.id));

  const topScore = ranked[0]?.score ?? 0;
  const topCandidates =
    topScore > 0
      ? ranked.filter((entry) => entry.score > 0).slice(0, 4)
      : ranked.slice(0, 4);

  const seedKey = [
    input.prompt.trim().toLowerCase().slice(0, 200),
    input.scaffoldId ?? "none",
    input.generationMode ?? "init",
    input.sessionSeed ?? "",
  ].join("::");
  const hash = hashSeed(seedKey);
  return topCandidates[hash % topCandidates.length]?.variant ?? variants[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Embedding-driven variant matching (opt-in, used by orchestrate when
// FEATURES.useDossierPipeline is on so we already have an OpenAI client).
//
// Strategy: precomputed embeddings (config/scaffold-variants/_index/variant-embeddings.json)
// are mtime-cached. At runtime, embed the user prompt once via OpenAI,
// cosine-search vs all variants for the chosen scaffoldId, take top 3,
// then use the same deterministic seed-hash to vary across sessions.
//
// Falls back to `pickScaffoldVariant` (keyword) when embeddings file is
// missing or no API key.
// ─────────────────────────────────────────────────────────────────────────

const VARIANT_EMBEDDINGS_PATH = resolve(
  process.cwd(),
  "config",
  "scaffold-variants",
  "_index",
  "variant-embeddings.json",
);

interface VariantEmbedding {
  id: string;
  scaffoldId: string;
  embedding: number[];
}

interface VariantEmbeddingsFile {
  _meta: { model: string; dimensions: number; generated: string; count: number };
  embeddings: VariantEmbedding[];
}

let _embeddingsCache: { mtimeMs: number; data: VariantEmbeddingsFile } | null = null;

function loadVariantEmbeddings(): VariantEmbeddingsFile | null {
  if (!existsSync(VARIANT_EMBEDDINGS_PATH)) return null;
  const mtime = statSync(VARIANT_EMBEDDINGS_PATH).mtimeMs;
  if (_embeddingsCache?.mtimeMs === mtime) return _embeddingsCache.data;
  try {
    const data = JSON.parse(readFileSync(VARIANT_EMBEDDINGS_PATH, "utf-8")) as VariantEmbeddingsFile;
    _embeddingsCache = { mtimeMs: mtime, data };
    return data;
  } catch {
    return null;
  }
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface PickScaffoldVariantAsyncOptions extends PickScaffoldVariantInput {
  /** Pre-embedded query vector (e.g. from dossier-select). When set, no API call. */
  queryVector?: number[];
  /** OpenAI API key. When set, embeds the prompt internally (extra API call). */
  embeddingApiKey?: string;
}

/**
 * Async variant pick — uses embedding-cosine when possible, falls back to
 * keyword `pickScaffoldVariant`. Safe to call when embeddings/API-key absent.
 */
export async function pickScaffoldVariantAsync(
  input: PickScaffoldVariantAsyncOptions,
): Promise<ScaffoldVariant | null> {
  const variants = getVariantsForScaffold(input.scaffoldId);
  if (variants.length === 0) return null;

  const embeddingsFile = loadVariantEmbeddings();
  if (!embeddingsFile) return pickScaffoldVariant(input);

  // Get query vector
  let queryVec: number[] | null = input.queryVector ?? null;
  if (!queryVec) {
    const apiKey = (input.embeddingApiKey ?? process.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) return pickScaffoldVariant(input);
    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey });
      const text = [
        input.prompt,
        (input.styleKeywords ?? []).join(" "),
        (input.toneKeywords ?? []).join(" "),
      ].filter(Boolean).join("\n");
      const res = await openai.embeddings.create({
        model: embeddingsFile._meta.model,
        input: text,
        dimensions: embeddingsFile._meta.dimensions,
      });
      queryVec = res.data[0]?.embedding ?? null;
    } catch {
      return pickScaffoldVariant(input);
    }
  }
  if (!queryVec) return pickScaffoldVariant(input);

  // Cosine vs each variant for this scaffold
  const variantVecsById = new Map(
    embeddingsFile.embeddings
      .filter((e) => e.scaffoldId === input.scaffoldId)
      .map((e) => [e.id, e.embedding]),
  );

  const ranked = variants
    .map((variant) => {
      const vec = variantVecsById.get(variant.id);
      const cos = vec ? cosine(queryVec!, vec) : 0;
      // Default-flagga ger fortfarande +0.05 boost för deterministisk fallback
      const score = cos + (variant.default ? 0.05 : 0);
      return { variant, score };
    })
    .sort((a, b) => b.score - a.score || a.variant.id.localeCompare(b.variant.id));

  if (ranked[0] && ranked[0].score === 0) {
    // Inga embeddings för denna scaffolds variants → keyword-fallback
    return pickScaffoldVariant(input);
  }

  const topCandidates = ranked.slice(0, 3);
  const seedKey = [
    input.prompt.trim().toLowerCase().slice(0, 200),
    input.scaffoldId ?? "none",
    input.generationMode ?? "init",
    input.sessionSeed ?? "",
  ].join("::");
  const hash = hashSeed(seedKey);
  return topCandidates[hash % topCandidates.length]?.variant ?? variants[0] ?? null;
}
