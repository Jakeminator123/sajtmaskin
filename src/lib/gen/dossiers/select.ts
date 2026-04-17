/**
 * Select dossiers to inject into the system prompt for one generation request.
 *
 * Algorithm:
 *   1. Always include: scaffold's `alwaysInclude` ids (no matter what).
 *   2. Embedding-driven: embed (prompt + brief + scaffold-context),
 *      cosine-search against active dossier embeddings, take top N per category.
 *   3. Recommendation boost: dossiers in scaffold's `primaryRecommended` get
 *      +0.15 score boost, `suggested` +0.05. Higher scoring wins.
 *   4. Cap per category and total to keep the prompt budget sane.
 *
 * Embedding is OPTIONAL — if no embeddings file or no API key, we fall back
 * to recommendation-only selection (alwaysInclude + primaryRecommended).
 *
 * The returned `SelectedDossier[]` is consumed by `system-prompt.ts` which
 * formats two blocks:
 *   ## Available Dossiers       (compact list — what's in the toolbox)
 *   ## Selected Dossier Instructions  (full instructions per chosen dossier)
 */

import OpenAI from "openai";

import {
  getActiveDossiers,
  getDossierById,
  getDossierEmbeddings,
  getDossierInstructions,
  getScaffoldRecommendations,
} from "./registry";
import type { DossierEntry, DossierSelectionResult, SelectedDossier } from "./types";

const DEFAULT_MAX_PER_CATEGORY = 1;
const DEFAULT_MAX_TOTAL = 5;
const PRIMARY_BOOST = 0.15;
const SUGGESTED_BOOST = 0.05;
// Cosine threshold below which a dossier is considered too weak a match
// to be worth its prompt budget. Raised from 0.2 → 0.3 (2026-04-17) after
// observing irrelevant Weaviate dossier surfacing for SaaS-bookkeeping
// prompts at score ~0.22. See övrigt/logg-sammanstallning-2026-04-17.md M2.
const EMBEDDING_MIN_SCORE = 0.3;

export interface SelectDossiersOptions {
  prompt: string;
  brief?: Record<string, unknown> | null;
  scaffoldId?: string | null;
  /** Compact scaffold context (label + tags) — used as embedding signal. */
  scaffoldContext?: string;
  /** Override defaults. */
  maxPerCategory?: number;
  maxTotal?: number;
  /** When false, skip embedding even if available. */
  useEmbeddings?: boolean;
  /** Inject API key for testing. */
  embeddingApiKey?: string;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildQueryText(opts: SelectDossiersOptions): string {
  const parts: string[] = [opts.prompt.trim()];
  if (opts.brief && typeof opts.brief === "object") {
    const briefText = [
      typeof opts.brief.oneSentencePitch === "string" ? opts.brief.oneSentencePitch : "",
      typeof opts.brief.targetAudience === "string" ? opts.brief.targetAudience : "",
      typeof opts.brief.primaryCallToAction === "string" ? opts.brief.primaryCallToAction : "",
      Array.isArray(opts.brief.toneAndVoice) ? opts.brief.toneAndVoice.join(" ") : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (briefText) parts.push(briefText);
  }
  if (opts.scaffoldContext) parts.push(opts.scaffoldContext);
  return parts.join("\n");
}

async function embedQueryText(text: string, apiKey: string, model: string, dimensions: number): Promise<number[]> {
  const openai = new OpenAI({ apiKey });
  const response = await openai.embeddings.create({
    model,
    input: text,
    dimensions,
  });
  const vec = response.data[0]?.embedding;
  if (!vec || vec.length === 0) {
    throw new Error("Empty embedding from OpenAI");
  }
  return vec;
}

function dedupTopN<T extends { score: number; entry: DossierEntry }>(
  items: T[],
  maxPerCategory: number,
  maxTotal: number,
): T[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const perCategory = new Map<string, number>();
  const out: T[] = [];
  for (const item of sorted) {
    if (out.length >= maxTotal) break;
    const cat = item.entry.category;
    const count = perCategory.get(cat) ?? 0;
    if (count >= maxPerCategory) continue;
    perCategory.set(cat, count + 1);
    out.push(item);
  }
  return out;
}

export async function selectDossiersForRequest(
  options: SelectDossiersOptions,
): Promise<DossierSelectionResult> {
  const active = getActiveDossiers();
  const maxPerCategory = options.maxPerCategory ?? DEFAULT_MAX_PER_CATEGORY;
  const maxTotal = options.maxTotal ?? DEFAULT_MAX_TOTAL;

  if (active.length === 0) {
    return {
      selected: [],
      poolSize: 0,
      embeddingsUsed: false,
      byCategory: {},
    };
  }

  const recs = options.scaffoldId ? getScaffoldRecommendations(options.scaffoldId) : null;
  const alwaysInclude = recs?.alwaysInclude ?? [];
  const primaryBoostIds = new Set(recs?.primaryRecommended ?? []);
  const suggestedBoostIds = new Set(recs?.suggested ?? []);

  // 1) Always-include (no scoring, always in)
  const alwaysSelected: SelectedDossier[] = [];
  for (const id of alwaysInclude) {
    const entry = getDossierById(id);
    if (!entry || (entry._status ?? "active") !== "active") continue;
    alwaysSelected.push({
      entry,
      score: Number.POSITIVE_INFINITY,
      reason: "alwaysInclude",
    });
  }

  // 2) Embedding-search
  const embeddingsFile = getDossierEmbeddings();
  const useEmbeddings =
    (options.useEmbeddings ?? true) &&
    Boolean(embeddingsFile) &&
    Boolean(options.embeddingApiKey ?? process.env.OPENAI_API_KEY?.trim());

  const scored: { entry: DossierEntry; score: number; reason: SelectedDossier["reason"] }[] = [];

  if (useEmbeddings && embeddingsFile) {
    const apiKey = (options.embeddingApiKey ?? process.env.OPENAI_API_KEY ?? "").trim();
    try {
      const queryVec = await embedQueryText(
        buildQueryText(options),
        apiKey,
        embeddingsFile._meta.model,
        embeddingsFile._meta.dimensions,
      );
      const byId = new Map(embeddingsFile.embeddings.map((e) => [e.id, e]));
      for (const entry of active) {
        const vecEntry = byId.get(entry.id);
        if (!vecEntry) continue;
        const cosine = cosineSimilarity(queryVec, vecEntry.embedding);
        if (cosine < EMBEDDING_MIN_SCORE) continue;
        let score = cosine;
        let reason: SelectedDossier["reason"] = "embedding";
        if (primaryBoostIds.has(entry.id)) {
          score += PRIMARY_BOOST;
          reason = "embedding+boost";
        } else if (suggestedBoostIds.has(entry.id)) {
          score += SUGGESTED_BOOST;
          reason = "embedding+boost";
        }
        scored.push({ entry, score, reason });
      }
    } catch (err) {
      console.warn(
        "[dossiers] embedding query failed — falling back to recommendation-only:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // 3) Recommendation-only fallback (no embeddings) — surface primary + suggested
  if (scored.length === 0 && recs) {
    for (const id of recs.primaryRecommended) {
      const entry = getDossierById(id);
      if (!entry || (entry._status ?? "active") !== "active") continue;
      scored.push({ entry, score: PRIMARY_BOOST, reason: "recommendation-only" });
    }
    for (const id of recs.suggested) {
      const entry = getDossierById(id);
      if (!entry || (entry._status ?? "active") !== "active") continue;
      if (scored.some((s) => s.entry.id === entry.id)) continue;
      scored.push({ entry, score: SUGGESTED_BOOST, reason: "recommendation-only" });
    }
  }

  // 4) Dedup + cap per category and total. Always-include items skip this cap.
  const alreadyIncludedIds = new Set(alwaysSelected.map((s) => s.entry.id));
  const filtered = scored.filter((s) => !alreadyIncludedIds.has(s.entry.id));
  const capped = dedupTopN(filtered, maxPerCategory, Math.max(0, maxTotal - alwaysSelected.length));

  const all: SelectedDossier[] = [
    ...alwaysSelected,
    ...capped.map((c) => ({
      entry: c.entry,
      score: c.score,
      reason: c.reason,
    })),
  ];

  // Eagerly load instructions for selected (small files, cached).
  for (const sel of all) {
    if (!sel.entry.instructions) {
      const text = getDossierInstructions(sel.entry.id);
      if (text) sel.entry.instructions = text;
    }
  }

  const byCategory: Record<string, string[]> = {};
  for (const sel of all) {
    (byCategory[sel.entry.category] ??= []).push(sel.entry.id);
  }

  return {
    selected: all,
    poolSize: active.length,
    embeddingsUsed: useEmbeddings,
    embeddingMeta: embeddingsFile?._meta
      ? { model: embeddingsFile._meta.model, dimensions: embeddingsFile._meta.dimensions }
      : undefined,
    byCategory,
  };
}
