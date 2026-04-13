/**
 * Shared word lists for prompt structure/complexity heuristics.
 *
 * All token lists live in `config/prompt-heuristic-tokens.json` — the single
 * editable source. This file re-exports typed arrays for TypeScript consumers.
 *
 * Consumers:
 * - promptAssist.ts        formatPrompt / addendum keyword extraction
 * - server-auto-brief-policy.ts   "looks structured" check
 * - promptOrchestration.ts        complexity analysis / design-heavy detection
 */

import tokensJson from "@/../config/prompt-heuristic-tokens.json";

function asReadonly(arr: string[]): readonly string[] {
  return arr;
}

export const STRUCTURE_TOKENS = asReadonly(tokensJson.structure.tokens);
export const DESIGN_TOKENS = asReadonly(tokensJson.design.tokens);
export const CONTENT_TOKENS = asReadonly(tokensJson.content.tokens);
export const SCOPE_MARKERS = asReadonly(tokensJson.scope.tokens);
export const REQUIREMENT_MARKERS = asReadonly(tokensJson.requirements.tokens);
export const SECTION_KEYWORDS = asReadonly(tokensJson.sections.tokens);
export const STYLE_KEYWORDS = asReadonly(tokensJson.styles.tokens);

export const STRUCTURED_PROMPT_TOKENS = [
  ...STRUCTURE_TOKENS,
  ...CONTENT_TOKENS,
] as const;

export function countTokenHits(text: string, tokens: readonly string[]): number {
  const lower = text.toLowerCase();
  return tokens.filter((token) => lower.includes(token)).length;
}
