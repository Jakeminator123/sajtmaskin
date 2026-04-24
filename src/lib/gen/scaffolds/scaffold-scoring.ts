import { and, gte, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { generationTelemetry } from "@/lib/db/schema";

export type ScaffoldScore = {
  scaffoldId: string;
  totalGenerations: number;
  successRate: number;
  feedbackScore: number;
  avgPreflightErrors: number;
  retryRate: number;
  compositeScore: number;
};

type ScaffoldStats = {
  totalGenerations: number;
  successCount: number;
  feedbackTotal: number;
  feedbackPositive: number;
  preflightErrorSum: number;
  retryCount: number;
  embeddingSelections: number;
};

const MIN_GENERATIONS = 5;
const LOOKBACK_DAYS = 30;
const CACHE_TTL_MS = 60 * 60 * 1000;

let cache: { scores: Map<string, ScaffoldScore>; ts: number } | null = null;

function computeCompositeScore(stats: ScaffoldStats): number {
  const {
    totalGenerations,
    successCount,
    feedbackTotal,
    feedbackPositive,
    preflightErrorSum,
    retryCount,
    embeddingSelections,
  } = stats;
  const successRate = totalGenerations > 0 ? successCount / totalGenerations : 0;
  const embeddingShare = totalGenerations > 0 ? embeddingSelections / totalGenerations : 0;
  const methodAdjustedSuccess = successRate * (1 - 0.15 * embeddingShare);
  const feedbackScore = feedbackTotal > 0 ? feedbackPositive / feedbackTotal : 0;
  const retryRate = totalGenerations > 0 ? retryCount / totalGenerations : 0;
  const avgPreflightErrors = totalGenerations > 0 ? preflightErrorSum / totalGenerations : 0;
  const preflightTerm = 1 - Math.min(avgPreflightErrors / 10, 1);
  return 0.4 * methodAdjustedSuccess + 0.3 * feedbackScore + 0.2 * (1 - retryRate) + 0.1 * preflightTerm;
}

function parseFeedbackRating(userFeedback: string | null): boolean | null {
  if (!userFeedback?.trim()) return null;
  try {
    const parsed = JSON.parse(userFeedback) as { rating?: string };
    if (parsed.rating === "positive") return true;
    if (parsed.rating === "negative") return false;
    return null;
  } catch {
    return null;
  }
}

export async function computeScaffoldScores(): Promise<ScaffoldScore[]> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - LOOKBACK_DAYS);

    const rows = await db
      .select({
        scaffoldId: generationTelemetry.scaffoldId,
        previewSuccess: generationTelemetry.previewSuccess,
        userFeedback: generationTelemetry.userFeedback,
        preflightErrorCount: generationTelemetry.preflightErrorCount,
        scaffoldRetryUsed: generationTelemetry.scaffoldRetryUsed,
        scaffoldSelectionMethod: generationTelemetry.scaffoldSelectionMethod,
      })
      .from(generationTelemetry)
      .where(
        and(
          gte(generationTelemetry.createdAt, thirtyDaysAgo),
          isNotNull(generationTelemetry.scaffoldId),
        ),
      );

    const byScaffold = new Map<string, ScaffoldStats>();

    for (const row of rows) {
      const id = row.scaffoldId;
      if (!id) continue;

      let stats = byScaffold.get(id);
      if (!stats) {
        stats = {
          totalGenerations: 0,
          successCount: 0,
          feedbackTotal: 0,
          feedbackPositive: 0,
          preflightErrorSum: 0,
          retryCount: 0,
          embeddingSelections: 0,
        };
        byScaffold.set(id, stats);
      }

      // SAJ-49: exclude rows where `previewSuccess` is null (timeout, abort,
      // hibernate, or any case where the preview lifecycle never produced a
      // confirmed pass/fail signal). Counting null as "miss" punished
      // scaffolds for infrastructure noise. Now `totalGenerations` and
      // `successRate` reflect only confirmed outcomes; pending/unknown rows
      // are observed via meta-telemetry instead, not folded into ranking.
      if (row.previewSuccess === null) {
        // Skip — keep `feedbackTotal` / `preflightErrorSum` / retry counters
        // out of confirmed-outcomes scope as well so the slice is consistent.
        continue;
      }
      stats.totalGenerations += 1;
      if (row.previewSuccess === true) stats.successCount += 1;
      const fb = parseFeedbackRating(row.userFeedback);
      if (fb !== null) {
        stats.feedbackTotal += 1;
        if (fb) stats.feedbackPositive += 1;
      }
      stats.preflightErrorSum += row.preflightErrorCount ?? 0;
      if (row.scaffoldRetryUsed === true) stats.retryCount += 1;
      // SAJ-53: `agreement` means keyword + embedding-top1 picked the same
      // scaffold, so semantics actively contributed to the decision. Count
      // it alongside `embedding` so `embeddingShare` reflects when the
      // matcher leaned on semantic signal at all (not only override wins).
      if (
        row.scaffoldSelectionMethod === "embedding" ||
        row.scaffoldSelectionMethod === "agreement"
      ) {
        stats.embeddingSelections += 1;
      }
    }

    const results: ScaffoldScore[] = [];
    for (const [scaffoldId, stats] of byScaffold) {
      if (stats.totalGenerations < MIN_GENERATIONS) continue;

      const successRate = stats.totalGenerations > 0 ? stats.successCount / stats.totalGenerations : 0;
      const feedbackScore = stats.feedbackTotal > 0 ? stats.feedbackPositive / stats.feedbackTotal : 0;
      const avgPreflightErrors = stats.totalGenerations > 0 ? stats.preflightErrorSum / stats.totalGenerations : 0;
      const retryRate = stats.totalGenerations > 0 ? stats.retryCount / stats.totalGenerations : 0;

      results.push({
        scaffoldId,
        totalGenerations: stats.totalGenerations,
        successRate,
        feedbackScore,
        avgPreflightErrors,
        retryRate,
        compositeScore: computeCompositeScore(stats),
      });
    }

    return results;
  } catch (err) {
    console.error("[scaffold-scoring] computeScaffoldScores failed:", err);
    return [];
  }
}

export async function getScaffoldBoost(scaffoldId: string): Promise<number> {
  try {
    const cached = cache && Date.now() - cache.ts < CACHE_TTL_MS ? cache.scores : null;
    let scores = cached?.get(scaffoldId) ?? null;

    if (!scores) {
      const all = cached ? Array.from(cached.values()) : await computeScaffoldScores();
      if (!cached || !cache || Date.now() - cache.ts >= CACHE_TTL_MS) {
        const map = new Map<string, ScaffoldScore>();
        for (const s of all) map.set(s.scaffoldId, s);
        cache = { scores: map, ts: Date.now() };
      }
      scores = (cache?.scores ?? new Map()).get(scaffoldId) ?? null;
    }

    if (!scores || scores.totalGenerations < MIN_GENERATIONS) return 0;

    const boost = (scores.compositeScore - 0.5) * 4;
    return Math.max(-2, Math.min(2, boost));
  } catch {
    return 0;
  }
}
