/**
 * Wrapper around `pickScaffoldVariantAsync` that extracts style/tone
 * keywords from the Brief and forwards them to the embedding-driven
 * variant picker. Falls back to keyword picker automatically when no
 * OpenAI key / embeddings are available.
 *
 * Extracted from `src/lib/gen/orchestrate.ts` 2026-04-21.
 */

import {
  pickScaffoldVariantAsync,
  type ScaffoldVariant,
} from "../scaffold-variants";

export async function resolveScaffoldVariant(
  scaffoldId: string | null | undefined,
  prompt: string,
  brief: Record<string, unknown> | null,
  generationMode: "init" | "followUp",
  sessionSeed?: string,
): Promise<ScaffoldVariant | null> {
  const styleKeywords = Array.isArray(
    (brief as { visualDirection?: { styleKeywords?: unknown } } | null)?.visualDirection
      ?.styleKeywords,
  )
    ? (
        (brief as { visualDirection?: { styleKeywords?: unknown[] } } | null)?.visualDirection
          ?.styleKeywords ?? []
      ).filter(
        (keyword): keyword is string =>
          typeof keyword === "string" && keyword.trim().length > 0,
      )
    : [];

  const toneKeywords = Array.isArray(
    (brief as { toneAndVoice?: unknown } | null)?.toneAndVoice,
  )
    ? ((brief as { toneAndVoice?: unknown[] } | null)?.toneAndVoice ?? []).filter(
        (keyword): keyword is string =>
          typeof keyword === "string" && keyword.trim().length > 0,
      )
    : [];

  return pickScaffoldVariantAsync({
    prompt,
    scaffoldId: (scaffoldId as ScaffoldVariant["scaffoldId"] | null | undefined) ?? null,
    styleKeywords,
    toneKeywords,
    generationMode,
    sessionSeed,
  });
}
