import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { getVariantsForScaffold, getVariantById } from "./registry";
import { getBlockedVariantIds } from "./eval-blocklist";
import type { PickScaffoldVariantInput, ScaffoldVariant } from "./types";
import { cosineSimilarity } from "@/lib/gen/embeddings/cosine";
import type { FollowUpIntentMode } from "@/lib/gen/follow-up-intent-types";

/**
 * Bakåtkompatibilitets-alias. Den ursprungliga lokala typen är borttagen;
 * matchern lutar sig nu mot den delade `FollowUpIntentMode` i
 * `src/lib/gen/follow-up-intent-types.ts`. Aliasen ligger kvar i fall
 * något test eller framtida konsument importerar det gamla namnet.
 */
export type LockedVariantFollowUpIntent = FollowUpIntentMode;

export interface LockedVariantForFollowUpInput {
  chatId?: string | null;
  intent: FollowUpIntentMode;
  scaffoldId: string | null | undefined;
  priorVariantId: string | null | undefined;
}

/**
 * P22: variant-lock på follow-ups. Returnerar prior versionens variant så
 * länge intenten inte är `clear-redesign` — då släpper vi loss matchern
 * så användaren kan få en ny stilriktning. För `clear-refine`,
 * `ambiguous-*` och `neutral` håller vi variant stabil mellan turns,
 * vilket stoppar drift av typen `warm-local → corporate-grid` mellan
 * v1 och v2 i samma chat.
 *
 * Returnerar `null` när:
 *  - intent === 'clear-redesign'
 *  - prior-id eller scaffold-id saknas
 *  - prior-id inte längre resolvar i registret
 *
 * P26: varje skip-path loggas så vi kan attribuera variant-flippar i
 * produktion till rätt orsak (saknad snapshot vs scaffold-byte vs
 * intent-klassificering vs registrymismatch).
 */
export function lockedVariantForFollowUp(
  input: LockedVariantForFollowUpInput,
): ScaffoldVariant | null {
  if (input.intent === "clear-redesign") {
    console.info("[scaffold-variant] variant_lock_skip", {
      reason: "clear_redesign_intent",
      chatId: input.chatId ?? null,
      scaffoldId: input.scaffoldId ?? null,
      priorVariantId: input.priorVariantId ?? null,
    });
    return null;
  }
  if (!input.scaffoldId || !input.priorVariantId) {
    console.info("[scaffold-variant] variant_lock_skip", {
      reason: !input.scaffoldId ? "missing_scaffold_id" : "missing_prior_variant_id",
      chatId: input.chatId ?? null,
      scaffoldId: input.scaffoldId ?? null,
      priorVariantId: input.priorVariantId ?? null,
      intent: input.intent,
    });
    return null;
  }
  const variant = getVariantById(
    input.scaffoldId as ScaffoldVariant["scaffoldId"],
    input.priorVariantId,
  );
  if (!variant) {
    console.info("[scaffold-variant] variant_lock_skip", {
      reason: "prior_variant_unresolved",
      chatId: input.chatId ?? null,
      scaffoldId: input.scaffoldId,
      priorVariantId: input.priorVariantId,
      intent: input.intent,
    });
    return null;
  }
  if (variant.scaffoldId !== input.scaffoldId) {
    console.info("[scaffold-variant] variant_lock_skip", {
      reason: "scaffold_id_mismatch",
      chatId: input.chatId ?? null,
      scaffoldId: input.scaffoldId,
      variantScaffoldId: variant.scaffoldId,
      priorVariantId: input.priorVariantId,
      intent: input.intent,
    });
    return null;
  }
  return variant;
}

/**
 * Removes variant ids that the eval pipeline flagged as
 * `candidatesForRemoval`. Falls back to the unfiltered list when the
 * blocklist would leave us with zero candidates (safety net so a
 * misconfigured eval can never softlock variant selection).
 */
function applyEvalBlocklist(
  variants: ScaffoldVariant[],
  scaffoldId: string | null | undefined,
): ScaffoldVariant[] {
  if (!scaffoldId) return variants;
  const blocked = getBlockedVariantIds(scaffoldId);
  if (blocked.size === 0) return variants;
  const filtered = variants.filter((variant) => !blocked.has(variant.id));
  return filtered.length > 0 ? filtered : variants;
}

function hashSeed(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Deterministic seed for tie-breaking variant picks across sessions.
 * Same prompt + scaffold + mode + sessionSeed always picks the same variant.
 */
function buildVariantSeedKey(input: PickScaffoldVariantInput): string {
  return [
    input.prompt.trim().toLowerCase().slice(0, 200),
    input.scaffoldId ?? "none",
    input.generationMode ?? "init",
    input.sessionSeed ?? "",
  ].join("::");
}

/**
 * Minimum cosine similarity that qualifies a variant pick as "semantic-driven".
 * Below this, the embedding signal is treated as noise and we fall back to
 * keyword scoring. Prevents brand-new variants without embeddings (or
 * extremely off-topic prompts) from ranking purely on near-zero cosines.
 */
const VARIANT_EMBEDDING_MIN_SCORE = 0.25;

function scoreVariant(
  variant: ScaffoldVariant,
  promptLower: string,
  styleKeywordsLower: string[],
  toneKeywordsLower: string[],
): number {
  // Tidigare: `let score = variant.default ? 1 : 0;` — gav default-varianten
  // en poäng-fördel även när inga keywords matchade. Konsekvens: för prompts
  // utan tydliga keyword-träffar (t.ex. "graveyard punk museum") vann alltid
  // `corporate-grid` på sin default-flagga, vilket gav bristfällig stilmatch.
  // Nu låter vi keyword/embedding-resultatet bestämma ensamt; vid total
  // tie faller seed-hash-pickern (caller) tillbaka till första kandidaten.
  let score = 0;

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
  const allVariants = getVariantsForScaffold(input.scaffoldId);
  if (allVariants.length === 0) return null;
  const variants = applyEvalBlocklist(allVariants, input.scaffoldId);

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

  const hash = hashSeed(buildVariantSeedKey(input));
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
  const allVariants = getVariantsForScaffold(input.scaffoldId);
  if (allVariants.length === 0) return null;
  const variants = applyEvalBlocklist(allVariants, input.scaffoldId);

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
      const cos = vec ? cosineSimilarity(queryVec!, vec) : 0;
      // Tidigare: `cos + (variant.default ? 0.05 : 0)` — när alla varianters
      // cosine låg nära varandra (vanligt vid prompts som inte träffar någon
      // variant tydligt) tippade +0.05 över till default-varianten. Nu får
      // semantik bestämma ensamt; det ger LLM/embedding större roll.
      const score = cos;
      return { variant, score };
    })
    .sort((a, b) => b.score - a.score || a.variant.id.localeCompare(b.variant.id));

  // Fallback to keyword scoring whenever the embedding signal is too weak
  // to be informative. Three cases handled:
  //   1) No variant under this scaffold has an embedding → top score = 0.
  //   2) Top score sits below `VARIANT_EMBEDDING_MIN_SCORE` (noise floor).
  //   3) The pick we'd return is a variant whose own embedding is missing
  //      (cos = 0 by construction) — in that case the pick is effectively
  //      arbitrary, so let keyword scoring decide instead.
  const hasAnyEmbedding = ranked.some((entry) => entry.score > 0);
  if (!hasAnyEmbedding) {
    return pickScaffoldVariant(input);
  }
  if (!ranked[0] || ranked[0].score < VARIANT_EMBEDDING_MIN_SCORE) {
    return pickScaffoldVariant(input);
  }

  // Only consider candidates that actually cleared the floor; otherwise the
  // hash-modulo could land on a variant lacking embeddings entirely.
  const qualifying = ranked.filter(
    (entry) => entry.score >= VARIANT_EMBEDDING_MIN_SCORE,
  );
  if (qualifying.length === 0) {
    return pickScaffoldVariant(input);
  }

  // Rotera bara mellan toppvarianter som faktiskt är *nära varandra*.
  // Tidigare: `slice(0, 3)` och alltid hash-modulo over top-3 — gav
  // corporate-grid 0/20 i 2026-04-18 landing-audit trots att dess
  // embedding-cosine var högst för B2B/consulting-prompts (OMTAG fas 2·B / E7).
  // Nu: kräv att toppresultatet inte leder över #2 med mer än
  // `VARIANT_DOMINANT_MARGIN` för att rotationen ska slå in; annars vinner
  // toppen rakt av. Bevarar variation mellan sessioner när cosine-fältet är
  // jämnt men skyddar dominanta embedding-vinster.
  const VARIANT_DOMINANT_MARGIN = 0.05;
  const top = qualifying[0]!;
  if (
    qualifying.length === 1 ||
    top.score - qualifying[1]!.score >= VARIANT_DOMINANT_MARGIN
  ) {
    return top.variant;
  }
  const tiedCandidates = qualifying
    .filter((entry) => top.score - entry.score < VARIANT_DOMINANT_MARGIN)
    .slice(0, 3);
  const hash = hashSeed(buildVariantSeedKey(input));
  return tiedCandidates[hash % tiedCandidates.length]?.variant ?? top.variant;
}
