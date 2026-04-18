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
import { computeDomainVeto, filterBlockedCategories } from "./domain-veto";
import type { DossierEntry, DossierSelectionResult, SelectedDossier } from "./types";

// All thresholds below are env-overridable so the bygg-LLM får mer
// utrymme att styra utan kodändringar. Defaults är medvetet konservativa
// (höjda 2026-04-18) efter att Stripe + Upstash drogs in på en
// "graveyard punk museum"-prompt utan motivering. Se docs/ENV.md.

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readCsvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

const DEFAULT_MAX_PER_CATEGORY = readNumberEnv("DOSSIER_MAX_PER_CATEGORY", 1);
const DEFAULT_MAX_TOTAL = readNumberEnv("DOSSIER_MAX_TOTAL", 3); // sänkt 5 → 3
const PRIMARY_BOOST = readNumberEnv("DOSSIER_PRIMARY_BOOST", 0.15);
const SUGGESTED_BOOST = readNumberEnv("DOSSIER_SUGGESTED_BOOST", 0.05);

// Globalt cosine-golv. Höjt 0.30 → 0.45 efter observerad regression där
// peripheral dossiers (Stripe, pageview-counter) drogs in på irrelevanta
// prompts. Per-kategori-tröskel nedan kan vara striktare.
const EMBEDDING_MIN_SCORE = readNumberEnv("DOSSIER_MIN_SCORE", 0.45);

// Per-kategori cosine-golv. Risk-vägd: payments/auth/database/realtime är
// dyra fel att dra in (drar med externa beroenden, env-vars, kodyta som
// kan falla sönder), så de kräver tydligare semantisk match än rena
// UI-dossiers.
const CATEGORY_MIN_SCORE: Record<string, number> = {
  payments: readNumberEnv("DOSSIER_MIN_SCORE_PAYMENTS", 0.55),
  auth: readNumberEnv("DOSSIER_MIN_SCORE_AUTH", 0.55),
  database: readNumberEnv("DOSSIER_MIN_SCORE_DATABASE", 0.5),
  realtime: readNumberEnv("DOSSIER_MIN_SCORE_REALTIME", 0.5),
  ai: readNumberEnv("DOSSIER_MIN_SCORE_AI", 0.5),
};

// Hard-gate: kategorier som ALDRIG ska injiceras för en given siteType.
// Default: brochure-sajter (rena landningssidor/portföljer/info-sidor)
// behöver sällan payments/auth/database — låt heuristiken stå utanför
// vägen om brief-LLM:n inte explicit har bett om det.
const BROCHURE_BLOCKED_CATEGORIES = new Set(
  readCsvEnv("DOSSIER_BROCHURE_BLOCK_CATEGORIES").length > 0
    ? readCsvEnv("DOSSIER_BROCHURE_BLOCK_CATEGORIES")
    : ["payments", "auth", "database", "realtime"],
);

export interface SelectDossiersOptions {
  prompt: string;
  brief?: Record<string, unknown> | null;
  scaffoldId?: string | null;
  /** Compact scaffold context (label + tags) — used as embedding signal. */
  scaffoldContext?: string;
  /** Optional capability hint lines (auth/payments/data/ai/etc.) — added to embedding query. */
  capabilityHints?: string;
  /** Optional route-plan summary (page list + sections) — added to embedding query. */
  routePlanSummary?: string;
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

/**
 * Build the embedding query text. Broader = more accurate match, but capped
 * to keep tokens reasonable. Order matters — earliest text gets highest
 * implicit weight in the embedding.
 *
 * Includes (when present):
 *   - prompt (always)
 *   - brief: oneSentencePitch, targetAudience, primaryCallToAction, toneAndVoice
 *           + pages[].purpose, mustHave, uiNotes.components, domainProfile,
 *             qualityBar, motionLevel
 *   - scaffoldContext (label + tags)
 *   - capabilityHints (inferred capability lines)
 *   - routePlanSummary (page-list summary)
 */
function buildQueryText(opts: SelectDossiersOptions): string {
  const parts: string[] = [opts.prompt.trim()];

  if (opts.brief && typeof opts.brief === "object") {
    const brief = opts.brief as Record<string, unknown>;
    const briefBits: string[] = [];

    if (typeof brief.oneSentencePitch === "string") briefBits.push(brief.oneSentencePitch);
    if (typeof brief.targetAudience === "string") briefBits.push(brief.targetAudience);
    if (typeof brief.primaryCallToAction === "string") briefBits.push(brief.primaryCallToAction);
    if (Array.isArray(brief.toneAndVoice)) briefBits.push(brief.toneAndVoice.join(" "));

    // Domain + quality signals are strong dossier-selection hints
    if (typeof brief.domainProfile === "string" && brief.domainProfile) {
      briefBits.push(`domain: ${brief.domainProfile}`);
    }
    if (typeof brief.qualityBar === "string" && brief.qualityBar) {
      briefBits.push(`quality: ${brief.qualityBar}`);
    }

    // Pages (purpose lines) — surfaces feature intent ("login", "checkout", etc.)
    if (Array.isArray(brief.pages)) {
      const purposes = brief.pages
        .map((p) => (p && typeof p === "object" && typeof (p as { purpose?: unknown }).purpose === "string"
          ? (p as { purpose: string }).purpose
          : ""))
        .filter(Boolean)
        .slice(0, 8);
      if (purposes.length > 0) briefBits.push(`pages: ${purposes.join(" | ")}`);
    }

    // Hard requirements + UI components — strong feature signals
    if (Array.isArray(brief.mustHave) && brief.mustHave.length > 0) {
      briefBits.push(`mustHave: ${(brief.mustHave as unknown[]).filter((v) => typeof v === "string").slice(0, 8).join(", ")}`);
    }
    if (brief.uiNotes && typeof brief.uiNotes === "object") {
      const uiNotes = brief.uiNotes as { components?: unknown };
      if (Array.isArray(uiNotes.components) && uiNotes.components.length > 0) {
        briefBits.push(
          `components: ${(uiNotes.components as unknown[])
            .filter((v) => typeof v === "string")
            .slice(0, 10)
            .join(", ")}`,
        );
      }
    }

    const briefText = briefBits.filter(Boolean).join(" ");
    if (briefText) parts.push(briefText);
  }

  if (opts.scaffoldContext) parts.push(opts.scaffoldContext);
  if (opts.capabilityHints?.trim()) parts.push(opts.capabilityHints.trim());
  if (opts.routePlanSummary?.trim()) parts.push(opts.routePlanSummary.trim());

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
      const briefSiteType =
        options.brief && typeof options.brief === "object"
          ? (options.brief as { siteType?: unknown }).siteType
          : null;
      const isBrochure = typeof briefSiteType === "string" && briefSiteType.toLowerCase() === "brochure";
      for (const entry of active) {
        const vecEntry = byId.get(entry.id);
        if (!vecEntry) continue;
        const cosine = cosineSimilarity(queryVec, vecEntry.embedding);
        // Brochure hard-gate: skippa heuristiskt riskabla kategorier
        // (payments/auth/database/realtime) helt på info-/landningssidor
        // om brief-LLM:n inte explicit har bett om dem via mustHave/pages.
        if (isBrochure && BROCHURE_BLOCKED_CATEGORIES.has(entry.category)) {
          continue;
        }
        // Per-kategori cosine-golv (striktare för riskfyllda kategorier)
        const categoryFloor = CATEGORY_MIN_SCORE[entry.category] ?? EMBEDDING_MIN_SCORE;
        if (cosine < categoryFloor) continue;
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

  // 3.5) Domain veto — drop candidates whose category clearly mismatches
  // the inferred lightweight domain (hospitality/portfolio/blog/etc.)
  // unless the prompt explicitly mentions a service in that category.
  // Always-include items bypass the veto by construction (handled later).
  // See `./domain-veto.ts` and BUGGRAPPORT-2026-04-18 § A2/A4.
  const veto = computeDomainVeto({ prompt: options.prompt, brief: options.brief ?? null });
  const vetoFiltered = filterBlockedCategories(scored, veto);
  if (veto.detectedDomain && vetoFiltered.length < scored.length) {
    const droppedIds = scored
      .filter((s) => !vetoFiltered.some((v) => v.entry.id === s.entry.id))
      .map((s) => `${s.entry.id} (${s.entry.category})`);
    console.warn(
      `[dossiers] domain-veto (${veto.detectedDomain}) dropped ${droppedIds.length} dossier(s):`,
      droppedIds.join(", "),
    );
  }

  // 4) Dedup + cap per category and total. Always-include items skip this cap.
  const alreadyIncludedIds = new Set(alwaysSelected.map((s) => s.entry.id));
  const filtered = vetoFiltered.filter((s) => !alreadyIncludedIds.has(s.entry.id));
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
