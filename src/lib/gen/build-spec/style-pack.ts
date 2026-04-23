/**
 * Score-based style-pack vocabulary + inference.
 *
 * Split out of `build-spec.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ScaffoldManifest } from "../scaffolds/types";
import type { BuildSpecChangeScope } from "./types";

/**
 * Score-based stylepack vocabulary. Each (regex, weight) tuple contributes
 * its weight to the bucket's score on a regex hit. The highest-scoring
 * bucket wins; the runner-up surfaces as `stylePackSecondary` when the gap
 * is narrow.
 *
 * Replaces the prior first-match-wins regex cascade where a prompt like
 * `"futuristic minimalist luxury landing"` always resolved to `minimal`
 * (the first regex), even when `luxury` was the dominant cue.
 *
 * Weight model: rare/distinctive cues (`brutalist`, `cyberpunk`, primary
 * style names) score 5; supporting vocabulary (`refined`, `magazine`,
 * `neon`) scores 1–2 so a single specific word still beats a flood of
 * generic adjectives.
 */
const STYLE_PACK_VOCAB: Record<string, Array<{ pattern: RegExp; weight: number }>> = {
  brutalist: [
    { pattern: /\bbrutalist\b/i, weight: 5 },
    { pattern: /\b(?:raw|harsh|monolith(?:ic)?|stark)\b/i, weight: 1 },
  ],
  editorial: [
    { pattern: /\beditorial\b/i, weight: 5 },
    { pattern: /\b(?:magazine|long[- ]?form|reading|journal(?:istic)?|serif heavy)\b/i, weight: 2 },
    { pattern: /\b(?:typografi|typography focused)\b/i, weight: 1 },
  ],
  minimal: [
    { pattern: /\bminimal(?:ist|istic)?\b/i, weight: 5 },
    { pattern: /\b(?:clean|whitespace|airy|understated|sparse|stripped[- ]?back)\b/i, weight: 1 },
  ],
  luxury: [
    { pattern: /\bluxury\b/i, weight: 5 },
    { pattern: /\b(?:premium|exclusive|haute|couture|elegant|refined|sophisticated|opulent)\b/i, weight: 2 },
    { pattern: /\b(?:gold|champagne|velvet|marble|noir)\b/i, weight: 1 },
  ],
  playful: [
    { pattern: /\bplayful\b/i, weight: 5 },
    { pattern: /\b(?:fun|quirky|cheerful|whimsical|cartoon|bouncy|leklust|lekfull)\b/i, weight: 2 },
    { pattern: /\b(?:colorful|vibrant)\b/i, weight: 1 },
  ],
  retro: [
    { pattern: /\b(?:retro|vintage|nostalgic|throwback)\b/i, weight: 5 },
    { pattern: /\b(?:80s|90s|y2k|pixel(?:ated)?|crt|vhs|grain(?:y)?)\b/i, weight: 2 },
  ],
  futuristic: [
    { pattern: /\b(?:futurist(?:ic)?|cyberpunk|sci[- ]?fi|space[- ]?age)\b/i, weight: 5 },
    { pattern: /\b(?:neon|holograph(?:ic)?|glitch|matrix|hud|techno)\b/i, weight: 2 },
    { pattern: /\b(?:dark|glow|gradient mesh)\b/i, weight: 1 },
  ],
};

const STYLE_PACK_SECONDARY_GAP = 2;

function scoreStylePackBuckets(prompt: string): Map<string, number> {
  const promptLower = prompt.toLowerCase();
  const scores = new Map<string, number>();
  for (const [bucket, entries] of Object.entries(STYLE_PACK_VOCAB)) {
    let score = 0;
    for (const { pattern, weight } of entries) {
      if (pattern.test(promptLower)) score += weight;
    }
    if (score > 0) scores.set(bucket, score);
  }
  return scores;
}

function inferStylePackFallback(
  buildIntent: BuildIntent,
  resolvedScaffold: ScaffoldManifest | null,
  changeScope: BuildSpecChangeScope,
): string {
  if (resolvedScaffold?.id === "blog") return "editorial";
  if (resolvedScaffold?.id === "ecommerce") return "commerce";
  if (resolvedScaffold?.id === "saas-landing") return "saas";
  if (buildIntent === "app") return "app-product";
  if (changeScope === "copy") return "current-site";
  return "brand-led";
}

export function inferStylePack(
  prompt: string,
  buildIntent: BuildIntent,
  resolvedScaffold: ScaffoldManifest | null,
  changeScope: BuildSpecChangeScope,
): { primary: string; secondary: string | null } {
  const scores = scoreStylePackBuckets(prompt);
  const fallback = inferStylePackFallback(buildIntent, resolvedScaffold, changeScope);

  if (scores.size === 0) {
    return { primary: fallback, secondary: null };
  }

  const sorted = Array.from(scores.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  const [primary, primaryScore] = sorted[0]!;
  const runnerUp = sorted[1];
  const secondary =
    runnerUp && primaryScore - runnerUp[1] < STYLE_PACK_SECONDARY_GAP
      ? runnerUp[0]
      : null;
  return { primary, secondary };
}
