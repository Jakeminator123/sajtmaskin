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
    if (promptLower.includes(lower)) {
      keywordHits += 1;
      continue;
    }
    if (styleKeywordsLower.some((value) => value.includes(lower))) {
      keywordHits += 1;
      continue;
    }
    if (toneKeywordsLower.some((value) => value.includes(lower))) {
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
