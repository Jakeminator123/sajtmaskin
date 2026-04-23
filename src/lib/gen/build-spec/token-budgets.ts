/**
 * Token budgets per `contextPolicy` + model-aware scaling.
 *
 * Split out of `build-spec.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { BuildSpecContextPolicy, BuildSpecTokenBudgets } from "./types";

/**
 * Token budgets per `contextPolicy`. Tuned to be **generous but not absurd**:
 * the smart `inferContextPolicy` already picks the right tier based on
 * change scope, route count, integrations, and capability heaviness — so the
 * absolute numbers just need enough headroom that block pruning rarely fires
 * unless we're genuinely overflowing.
 *
 * **Model awareness (added 2026-04-21):** when the caller passes a
 * `modelContextWindowTokens` value, all three token figures are scaled by
 * `modelContextWindowTokens / MODEL_BUDGET_BASELINE_TOKENS`, clamped to
 * `[MODEL_BUDGET_SCALE_MIN, MODEL_BUDGET_SCALE_MAX]`. This lets a 1M-window
 * model spend ~3× the system-context tokens of a 200k baseline model
 * without us hardcoding per-provider numbers. Char mirrors are recomputed
 * from the scaled token figures via `CHARS_PER_TOKEN_RATIO_*`.
 */
const MODEL_BUDGET_BASELINE_TOKENS = 200_000;
const MODEL_BUDGET_SCALE_MIN = 0.6;
const MODEL_BUDGET_SCALE_MAX = 3.0;
const CHARS_PER_TOKEN_RATIO_SCAFFOLD = 24_000 / 13_000;
const CHARS_PER_TOKEN_RATIO_REFS = 16_000 / 5_000;
const CHARS_PER_TOKEN_RATIO_CONTEXT = 70_000 / 22_000;

const BASE_TOKEN_BUDGETS: Record<BuildSpecContextPolicy, BuildSpecTokenBudgets> = {
  light: {
    scaffoldTokens: 13_000,
    refsTokens: 5_000,
    systemContextTokens: 22_000,
    scaffoldChars: 24_000,
    refsChars: 16_000,
    systemContextChars: 70_000,
  },
  normal: {
    scaffoldTokens: 22_000,
    refsTokens: 12_000,
    systemContextTokens: 60_000,
    scaffoldChars: 42_000,
    refsChars: 38_000,
    systemContextChars: 192_000,
  },
  heavy: {
    scaffoldTokens: 32_000,
    refsTokens: 16_000,
    systemContextTokens: 80_000,
    scaffoldChars: 60_000,
    refsChars: 50_000,
    systemContextChars: 256_000,
  },
};

function modelBudgetScale(modelContextWindowTokens: number | undefined): number {
  if (!modelContextWindowTokens || modelContextWindowTokens <= 0) return 1;
  const raw = modelContextWindowTokens / MODEL_BUDGET_BASELINE_TOKENS;
  return Math.max(MODEL_BUDGET_SCALE_MIN, Math.min(MODEL_BUDGET_SCALE_MAX, raw));
}

export function tokenBudgetsForContextPolicy(
  contextPolicy: BuildSpecContextPolicy,
  modelContextWindowTokens?: number,
): BuildSpecTokenBudgets {
  const base = BASE_TOKEN_BUDGETS[contextPolicy];
  const scale = modelBudgetScale(modelContextWindowTokens);
  if (scale === 1) return base;

  const scaffoldTokens = Math.round((base.scaffoldTokens ?? 0) * scale);
  const refsTokens = Math.round((base.refsTokens ?? 0) * scale);
  const systemContextTokens = Math.round((base.systemContextTokens ?? 0) * scale);
  return {
    scaffoldTokens,
    refsTokens,
    systemContextTokens,
    scaffoldChars: Math.round(scaffoldTokens * CHARS_PER_TOKEN_RATIO_SCAFFOLD),
    refsChars: Math.round(refsTokens * CHARS_PER_TOKEN_RATIO_REFS),
    systemContextChars: Math.round(systemContextTokens * CHARS_PER_TOKEN_RATIO_CONTEXT),
  };
}
