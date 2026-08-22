import { getDefaultVariantForScaffold, getVariantsForScaffold, getVariantById } from "./registry";
import type { PickScaffoldVariantInput, ScaffoldVariant, VariantMatchResult } from "./types";
import { cosineSimilarity } from "@/lib/gen/embeddings/cosine";
import {
  invalidateEmbeddingsArtifactCache,
  loadEmbeddingsArtifact,
} from "@/lib/gen/embeddings/embeddings-storage";
import { recordLlmUsage } from "@/lib/observability/llm-usage";
import type { FollowUpIntentMode } from "@/lib/gen/follow-up-intent-types";

export interface LockedVariantForFollowUpInput {
  chatId?: string | null;
  intent: FollowUpIntentMode;
  scaffoldId: string | null | undefined;
  priorVariantId: string | null | undefined;
  /**
   * The scaffold-side redesign unlock (`ignorePersistedScaffoldForMatch`).
   * Some full-redesign phrasings ("gör om hela sajten") unlock the scaffold via
   * the supplement patterns in `follow-up-clarification.ts` while the intent
   * classifier still reports `neutral`. Without this input the variant stayed
   * pinned to the old look, so the user got a rematched scaffold rendered in the
   * exact style they asked to replace. Optional/back-compat: absent = locked as
   * before.
   */
  scaffoldUnlocked?: boolean;
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
 *  - `scaffoldUnlocked` (scaffold-sidans redesign-unlock) är satt
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
  if (input.intent === "clear-redesign" || input.scaffoldUnlocked === true) {
    console.info("[scaffold-variant] variant_lock_skip", {
      reason:
        input.intent === "clear-redesign" ? "clear_redesign_intent" : "scaffold_unlocked_for_match",
      chatId: input.chatId ?? null,
      scaffoldId: input.scaffoldId ?? null,
      priorVariantId: input.priorVariantId ?? null,
    });
    return null;
  }
  if (!input.scaffoldId) {
    console.info("[scaffold-variant] variant_lock_skip", {
      reason: "missing_scaffold_id",
      chatId: input.chatId ?? null,
      scaffoldId: null,
      priorVariantId: input.priorVariantId ?? null,
      intent: input.intent,
    });
    return null;
  }
  // Plan 11 / open-question #8: when the snapshot lost the prior
  // variantId (e.g. chat created before variant tracking landed, or a
  // shallow merge wrote `null` over an earlier value), do NOT release
  // the matcher into a fresh keyword/embedding pick — that produced
  // the `corporate-grid → warm-local` mid-chat flips users complained
  // about. Fall back to the scaffold's default variant instead so the
  // look stays stable across turns. `clear-redesign` intent is handled
  // above and intentionally skips this fallback.
  if (!input.priorVariantId) {
    const fallback = getDefaultVariantForScaffold(
      input.scaffoldId as ScaffoldVariant["scaffoldId"],
    );
    console.info("[scaffold-variant] variant_lock_fallback", {
      reason: "missing_prior_variant_id",
      chatId: input.chatId ?? null,
      scaffoldId: input.scaffoldId,
      priorVariantId: null,
      intent: input.intent,
      fallbackVariantId: fallback?.id ?? null,
    });
    return fallback;
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

/**
 * When #1 leads #2 by at least this margin, pick the winner outright instead
 * of seed-hash rotating among the top pool. Shared by keyword and embedding
 * paths; keyword scores are integers so any positive gap clears 0.05.
 */
const VARIANT_DOMINANT_MARGIN = 0.05;

/**
 * Ordgräns-mönster med svensk böjningstolerans: för keywords ≥ 4 tecken får
 * stammen följas av upp till 4 extra bokstäver, så "natur" träffar
 * "naturen"/"naturens", "skog" träffar "skogen"/"skogarna" och "kafé" träffar
 * "kaféet". Korta keywords ("eco", "law", "b2b") förblir exakta ord, och
 * taket på 4 hindrar breda felträffar ("product" träffar inte
 * "productivity"). Sammansättningar täcks medvetet inte
 * ("trädgårdsplanering" kräver eget keyword) — precision före recall.
 * Exporterad för test.
 */
export function buildKeywordWordPattern(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Böjningstoleransen gäller bara en-ords-keywords. För fraser ("dark
  // theme", "white-space") skulle suffixet tyst töja sista ledet ("dark
  // themed") — fraser matchas ordagrant (bugbot-fynd 2026-07-31).
  const isSingleWord = !/[\s-]/.test(keyword);
  const inflectionSuffix = isSingleWord && keyword.length >= 4 ? "\\p{L}{0,4}" : "";
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escaped}${inflectionSuffix}(?:[^\\p{L}\\p{N}]|$)`,
    "iu",
  );
}

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
    const wordBoundary = buildKeywordWordPattern(lower);
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
  // Färglägesboosten läser prompt + strukturerade style/tone-keywords: Byggval
  // skickar "dark mode"/"light mode" via styleKeywordsHint i stället för
  // prompt-text, och brief-keywords kan bära samma signal.
  const colorSignalText = [promptLower, ...styleKeywordsLower, ...toneKeywordsLower].join(" ");
  if (
    variant.colorMode === "dark" &&
    /\b(dark|mörk|noir|black|svart|terminal)\b/i.test(colorSignalText)
  ) {
    score += 2;
  }
  if (variant.colorMode === "light" && /\b(light|ljus|airy|clean|ren)\b/i.test(colorSignalText)) {
    score += 1;
  }

  return score;
}

/**
 * Keyword variant picker. Three entry points own "the" pick at different times
 * — not merged (sync vs async have different cost and callers):
 *
 * 1. Style pin — `resolveVariantForStyleChoice` (Byggval Stil). Wins on init
 *    in `finalize-prompts.ts` before any matcher. Sync, no embeddings.
 * 2. Sync pre-match / fallback — this function. Used by create-chat and
 *    delta-brief (~1ms hints for Deep Brief) and as `buildDynamicContext`
 *    fallback when no orchestrate-resolved variant is passed. Intentionally
 *    not async: embeddings would add ~500ms before Brief.
 * 3. Async codegen pick — `pickScaffoldVariantAsync` via
 *    `resolveScaffoldVariant` in finalize-prompts, after style pin and
 *    persisted/locked variant. Embeddings when available; else this function.
 *
 * Init may pass the cheap pre-match as `variantHintId`, but finalize owns the
 * post-Brief decision and may replace that hint. Only follow-ups may supply a
 * persisted/locked variant. See B7 in the briefing/källpaket plan.
 */
export function pickScaffoldVariant(input: PickScaffoldVariantInput): ScaffoldVariant | null {
  return pickScaffoldVariantWithMeta(input).variant;
}

/** Keyword picker plus the evidence needed to explain the final authority choice. */
export function pickScaffoldVariantWithMeta(input: PickScaffoldVariantInput): VariantMatchResult {
  const variants = getVariantsForScaffold(input.scaffoldId);
  if (variants.length === 0) {
    return {
      variant: null,
      source: "hash-fallback",
      score: null,
      runnerUpScore: null,
      margin: null,
    };
  }

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
  // Vid nollpoäng finns ingen rankning att bevara: `ranked` är då sorterad
  // enbart på variant-id, så `slice(0, 4)` gjorde bara de fyra första
  // varianterna i bokstavsordning nåbara. Under `landing-page` kunde t.ex.
  // hero-fullbleed-bg, nature-flow och warm-editorial ALDRIG väljas för
  // prompts utan keyword-träff (vanligt för svenska prompts — "skogen"
  // matchar inte "forest"). Rotera i stället över hela kandidatfältet;
  // seed-hashen håller valet deterministiskt per prompt/session.
  if (topScore <= 0) {
    const hash = hashSeed(buildVariantSeedKey(input));
    return {
      variant: ranked[hash % ranked.length]?.variant ?? variants[0] ?? null,
      source: "hash-fallback",
      score: 0,
      runnerUpScore: ranked.length > 1 ? 0 : null,
      margin: ranked.length > 1 ? 0 : null,
    };
  }

  // Speglar embedding-vägens dominance-margin: när #1 leder klart över #2
  // vinner toppen rakt av. Seed-hash-rotation bara när poängfältet är jämnt.
  const positive = ranked.filter((entry) => entry.score > 0);
  const top = positive[0]!;
  if (positive.length === 1 || top.score - positive[1]!.score >= VARIANT_DOMINANT_MARGIN) {
    const runnerUpScore = positive[1]?.score ?? null;
    return {
      variant: top.variant,
      source: "keyword",
      score: top.score,
      runnerUpScore,
      margin: runnerUpScore === null ? null : top.score - runnerUpScore,
    };
  }
  const tiedCandidates = positive
    .filter((entry) => top.score - entry.score < VARIANT_DOMINANT_MARGIN)
    .slice(0, 4);
  const hash = hashSeed(buildVariantSeedKey(input));
  const selected = tiedCandidates[hash % tiedCandidates.length] ?? top;
  const runnerUpScore =
    positive.find((entry) => entry.variant.id !== selected.variant.id)?.score ?? null;
  return {
    variant: selected.variant,
    source: "keyword",
    score: selected.score,
    runnerUpScore,
    margin: runnerUpScore === null ? null : selected.score - runnerUpScore,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Embedding-driven variant matching (opt-in, used by orchestrate when
// FEATURES.useDossierPipeline is on so we already have an OpenAI client).
//
// Strategy: precomputed embeddings (Blob key embeddings/variant-embeddings.json,
// local cache under config/scaffold-variants/_index/) are process-cached.
// At runtime, embed the user prompt once via OpenAI,
// cosine-search vs all variants for the chosen scaffoldId, take top 3,
// then use the same deterministic seed-hash to vary across sessions.
//
// Falls back to `pickScaffoldVariant` (keyword) when embeddings file is
// missing or no API key.
// ─────────────────────────────────────────────────────────────────────────

interface VariantEmbedding {
  id: string;
  scaffoldId: string;
  embedding: number[];
}

interface VariantEmbeddingsFile {
  _meta: { model: string; dimensions: number; generated: string; count: number };
  embeddings: VariantEmbedding[];
}

async function loadVariantEmbeddings(): Promise<VariantEmbeddingsFile | null> {
  try {
    const data = (await loadEmbeddingsArtifact("variant")) as VariantEmbeddingsFile | null;
    if (!data || !Array.isArray(data.embeddings)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Clear process cache after regenerate/promote. */
export function invalidateVariantEmbeddingsCache(): void {
  invalidateEmbeddingsArtifactCache("variant");
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
  return (await pickScaffoldVariantAsyncWithMeta(input)).variant;
}

/** Embedding-aware picker plus scores/source for telemetry and fallback policy. */
export async function pickScaffoldVariantAsyncWithMeta(
  input: PickScaffoldVariantAsyncOptions,
): Promise<VariantMatchResult> {
  const variants = getVariantsForScaffold(input.scaffoldId);
  if (variants.length === 0) {
    return {
      variant: null,
      source: "hash-fallback",
      score: null,
      runnerUpScore: null,
      margin: null,
    };
  }

  const embeddingsFile = await loadVariantEmbeddings();
  if (!embeddingsFile) return pickScaffoldVariantWithMeta(input);

  // Get query vector
  let queryVec: number[] | null = input.queryVector ?? null;
  if (!queryVec) {
    const apiKey = (input.embeddingApiKey ?? process.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) return pickScaffoldVariantWithMeta(input);
    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey });
      const text = [
        input.prompt,
        (input.styleKeywords ?? []).join(" "),
        (input.toneKeywords ?? []).join(" "),
      ]
        .filter(Boolean)
        .join("\n");
      const embeddingStartedAt = Date.now();
      const res = await openai.embeddings.create({
        model: embeddingsFile._meta.model,
        input: text,
        dimensions: embeddingsFile._meta.dimensions,
      });
      recordLlmUsage({
        phase: "embeddings",
        workload: "scaffold_variant_match",
        model: embeddingsFile._meta.model,
        usage: res.usage,
        durationMs: Date.now() - embeddingStartedAt,
      });
      queryVec = res.data[0]?.embedding ?? null;
    } catch {
      return pickScaffoldVariantWithMeta(input);
    }
  }
  if (!queryVec) return pickScaffoldVariantWithMeta(input);

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
    return pickScaffoldVariantWithMeta(input);
  }
  if (!ranked[0] || ranked[0].score < VARIANT_EMBEDDING_MIN_SCORE) {
    return pickScaffoldVariantWithMeta(input);
  }

  // Only consider candidates that actually cleared the floor; otherwise the
  // hash-modulo could land on a variant lacking embeddings entirely.
  const qualifying = ranked.filter((entry) => entry.score >= VARIANT_EMBEDDING_MIN_SCORE);
  if (qualifying.length === 0) {
    return pickScaffoldVariantWithMeta(input);
  }

  // Rotera bara mellan toppvarianter som faktiskt är *nära varandra*.
  // Tidigare: `slice(0, 3)` och alltid hash-modulo over top-3 — gav
  // corporate-grid 0/20 i 2026-04-18 landing-audit trots att dess
  // embedding-cosine var högst för B2B/consulting-prompts (OMTAG fas 2·B / E7).
  // Nu: kräv att toppresultatet inte leder över #2 med mer än
  // `VARIANT_DOMINANT_MARGIN` för att rotationen ska slå in; annars vinner
  // toppen rakt av. Bevarar variation mellan sessioner när cosine-fältet är
  // jämnt men skyddar dominanta embedding-vinster.
  const top = qualifying[0]!;
  if (qualifying.length === 1 || top.score - qualifying[1]!.score >= VARIANT_DOMINANT_MARGIN) {
    const runnerUpScore = qualifying[1]?.score ?? null;
    return {
      variant: top.variant,
      source: "embedding",
      score: top.score,
      runnerUpScore,
      margin: runnerUpScore === null ? null : top.score - runnerUpScore,
    };
  }
  const tiedCandidates = qualifying
    .filter((entry) => top.score - entry.score < VARIANT_DOMINANT_MARGIN)
    .slice(0, 3);
  const hash = hashSeed(buildVariantSeedKey(input));
  const selected = tiedCandidates[hash % tiedCandidates.length] ?? top;
  const runnerUpScore =
    qualifying.find((entry) => entry.variant.id !== selected.variant.id)?.score ?? null;
  return {
    variant: selected.variant,
    source: "embedding",
    score: selected.score,
    runnerUpScore,
    margin: runnerUpScore === null ? null : selected.score - runnerUpScore,
  };
}
