/**
 * Scaffold matching — selects the best internal scaffold for a prompt
 * using embedding-based semantic search, filtered by buildIntent.
 *
 * Falls back to a deterministic default when embeddings are unavailable
 * (missing API key or empty embeddings file) or when no intent-compatible
 * candidate scores above the similarity threshold.
 */
import type { ScaffoldManifest } from "./types";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { getAllScaffolds, getScaffoldByFamily, getScaffoldById } from "./registry";
import type { ScaffoldSearchResult } from "./scaffold-search";
import { searchScaffolds } from "./scaffold-search";

const EMBEDDING_MIN_SCORE = 0.35;
const DEFAULT_WEBSITE_SCAFFOLD = "landing-page";
const DEFAULT_APP_SCAFFOLD = "app-shell";
const ULTIMATE_FALLBACK_SCAFFOLD = "base-nextjs";

export interface ScaffoldMatchMeta {
  matchSource: "embedding" | "manual" | "persisted" | "off" | "fallback";
  embeddingScore: number | null;
  embeddingRunnerUpId: string | null;
}

function determineFallback(buildIntent?: BuildIntent | null): ScaffoldManifest | null {
  if (buildIntent === "app") return getScaffoldByFamily(DEFAULT_APP_SCAFFOLD);
  if (buildIntent === "website" || buildIntent === "template") return getScaffoldById(DEFAULT_WEBSITE_SCAFFOLD);
  return getScaffoldByFamily(ULTIMATE_FALLBACK_SCAFFOLD);
}

function isIntentCompatible(scaffold: ScaffoldManifest, intent: BuildIntent | null | undefined): boolean {
  if (!intent) return true;
  const allowed = scaffold.buildIntents;
  if (allowed.includes(intent as typeof allowed[number])) return true;
  if (intent === "template" && allowed.includes("website")) return true;
  if (intent === "website" && allowed.includes("template")) return true;
  return false;
}

/**
 * Async scaffold matching using semantic embedding search.
 *
 * Embedding candidates are filtered by `buildIntents` so a website-only
 * scaffold cannot win when the user asks for an app. Returns the best
 * intent-compatible match above the similarity threshold, or a deterministic
 * fallback based on buildIntent.
 */
export async function matchScaffoldWithEmbeddings(
  prompt: string,
  buildIntent?: BuildIntent | null,
): Promise<{ scaffold: ScaffoldManifest | null; matchMeta: ScaffoldMatchMeta }> {
  const fallback = determineFallback(buildIntent);

  try {
    const results = await searchScaffolds(prompt, getAllScaffolds().length);
    const compatible = results.filter((r) => isIntentCompatible(r.scaffold, buildIntent));

    if (compatible.length > 0 && compatible[0].score >= EMBEDDING_MIN_SCORE) {
      const best = compatible[0];
      const runnerUp = compatible.length > 1 ? compatible[1] : null;
      return {
        scaffold: best.scaffold,
        matchMeta: {
          matchSource: "embedding",
          embeddingScore: Math.round(best.score * 1000) / 1000,
          embeddingRunnerUpId: runnerUp?.scaffold.id ?? null,
        },
      };
    }
  } catch {
    // Embedding search is best-effort; fall through to deterministic fallback.
  }

  return {
    scaffold: fallback,
    matchMeta: { matchSource: "fallback", embeddingScore: null, embeddingRunnerUpId: null },
  };
}
