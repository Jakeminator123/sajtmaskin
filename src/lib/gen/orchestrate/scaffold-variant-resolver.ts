/**
 * Wrapper around `pickScaffoldVariantAsync` that extracts style/tone
 * keywords from the Brief and forwards them to the embedding-driven
 * variant picker. Falls back to keyword picker automatically when no
 * OpenAI key / embeddings are available.
 *
 * Extracted from `src/lib/gen/orchestrate.ts` 2026-04-21.
 */

import {
  pickScaffoldVariantAsyncWithReceipt,
  type ScaffoldVariant,
  type VariantSelection,
} from "../scaffold-variants";

export async function resolveScaffoldVariant(
  scaffoldId: string | null | undefined,
  prompt: string,
  brief: Record<string, unknown> | null,
  generationMode: "init" | "followUp",
  sessionSeed?: string,
  /**
   * Byggval (init controls): structured style keywords from the client,
   * merged after the brief-derived keywords (deduped, case-insensitive).
   */
  extraStyleKeywords?: string[],
  /**
   * Byggval (init controls): structured tone keywords, merged after the brief's
   * `toneAndVoice` the same way. Before this existed the tone chips reached the
   * model only as a Swedish copy directive, so they never touched the scorer.
   */
  extraToneKeywords?: string[],
): Promise<ScaffoldVariant | null> {
  return (
    await resolveScaffoldVariantWithReceipt(
      scaffoldId,
      prompt,
      brief,
      generationMode,
      sessionSeed,
      extraStyleKeywords,
      extraToneKeywords,
    )
  ).variant;
}

export async function resolveScaffoldVariantWithReceipt(
  scaffoldId: string | null | undefined,
  prompt: string,
  brief: Record<string, unknown> | null,
  generationMode: "init" | "followUp",
  sessionSeed?: string,
  extraStyleKeywords?: string[],
  extraToneKeywords?: string[],
): Promise<{ variant: ScaffoldVariant | null; selection: VariantSelection }> {
  const briefStyleKeywords = Array.isArray(
    (brief as { visualDirection?: { styleKeywords?: unknown } } | null)?.visualDirection
      ?.styleKeywords,
  )
    ? (
        (brief as { visualDirection?: { styleKeywords?: unknown[] } } | null)?.visualDirection
          ?.styleKeywords ?? []
      ).filter(
        (keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0,
      )
    : [];

  const seenStyleKeywords = new Set(
    briefStyleKeywords.map((keyword) => keyword.trim().toLowerCase()),
  );
  const styleKeywords = [...briefStyleKeywords];
  for (const keyword of extraStyleKeywords ?? []) {
    if (typeof keyword !== "string") continue;
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seenStyleKeywords.has(key)) continue;
    seenStyleKeywords.add(key);
    styleKeywords.push(trimmed);
  }

  const briefToneKeywords = Array.isArray(
    (brief as { toneAndVoice?: unknown } | null)?.toneAndVoice,
  )
    ? ((brief as { toneAndVoice?: unknown[] } | null)?.toneAndVoice ?? []).filter(
        (keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0,
      )
    : [];

  const seenToneKeywords = new Set(
    briefToneKeywords.map((keyword) => keyword.trim().toLowerCase()),
  );
  const toneKeywords = [...briefToneKeywords];
  for (const keyword of extraToneKeywords ?? []) {
    if (typeof keyword !== "string") continue;
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seenToneKeywords.has(key)) continue;
    seenToneKeywords.add(key);
    toneKeywords.push(trimmed);
  }

  return pickScaffoldVariantAsyncWithReceipt({
    prompt,
    scaffoldId: (scaffoldId as ScaffoldVariant["scaffoldId"] | null | undefined) ?? null,
    styleKeywords,
    toneKeywords,
    generationMode,
    sessionSeed,
  });
}
