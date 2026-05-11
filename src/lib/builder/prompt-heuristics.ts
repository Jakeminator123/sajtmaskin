/**
 * Shared word lists for prompt structure/complexity heuristics.
 *
 * All token lists live in `config/prompt-heuristic-tokens.json` — the single
 * editable source. This file re-exports typed arrays for TypeScript consumers.
 *
 * Consumers:
 * - prompt-assist/                 fallback addendum keyword extraction
 * - promptOrchestration.ts        complexity analysis / design-heavy detection
 *
 * Note: server-side Deep Brief no longer skips structured website prompts;
 * `server-auto-brief-policy.ts` intentionally does not depend on these tokens.
 */

import tokensJson from "@/../config/prompt-heuristic-tokens.json";

function asReadonly(arr: string[]): readonly string[] {
  return arr;
}

export const DESIGN_TOKENS = asReadonly(tokensJson.design.tokens);
export const SCOPE_MARKERS = asReadonly(tokensJson.scope.tokens);
export const REQUIREMENT_MARKERS = asReadonly(tokensJson.requirements.tokens);
export const SECTION_KEYWORDS = asReadonly(tokensJson.sections.tokens);
export const STYLE_KEYWORDS = asReadonly(tokensJson.styles.tokens);

export function countTokenHits(text: string, tokens: readonly string[]): number {
  const lower = text.toLowerCase();
  return tokens.filter((token) => lower.includes(token)).length;
}
