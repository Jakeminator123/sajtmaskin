/**
 * Model input-context-window lookup.
 *
 * Used by `deriveBuildSpec()` via `modelBudgetScale()` to scale dynamic
 * context budgets relative to a 200k baseline. A 1M-window model can spend
 * proportionally more system-context tokens without us having to invent
 * per-tier numbers per provider.
 *
 * Keys are concrete `OwnModelId` values from `@/lib/models/catalog`. New
 * models default to `undefined` (no scaling, behaves as 200k baseline).
 *
 * Numbers are **input** context windows (not output cap). Verify against
 * the provider's docs when adding a new model.
 */

import type { OwnModelId } from "@/lib/models/catalog";

const MODEL_CONTEXT_WINDOWS: Partial<Record<OwnModelId, number>> = {
  // OpenAI direct API (api.openai.com)
  "gpt-4.1": 1_000_000,
  "gpt-5.2": 400_000,
  "gpt-5.3-codex": 400_000,
  // gpt-5.5 exposes a ~1.05M context window. modelBudgetScale() clamps at
  // 3.0x of the 200k baseline, so the max tier moves from 2.0x (gpt-5.4) to
  // the 3.0x ceiling. Lower this number if you want to cap the budget growth.
  "gpt-5.5": 1_050_000,
  "gpt-5.4": 400_000,
  "gpt-5.4-mini": 400_000,
  // Anthropic direct API (Claude API)
  "claude-sonnet-4.6": 200_000,
  // Opus 4.8 supports a 1M default context window (clamped to the 3.0x
  // budget ceiling). Not the anthropic-tier build model today (sonnet is),
  // so this is metadata until opus is selected as an engine model.
  "claude-opus-4.8": 1_000_000,
  "claude-opus-4.6": 200_000,
};

/**
 * Returns the input context window in tokens for a known own-engine model,
 * or `undefined` if the model is unknown (caller should treat undefined
 * as "use legacy default budgets unchanged").
 */
export function getModelContextWindowTokens(
  modelId: string | null | undefined,
): number | undefined {
  if (!modelId) return undefined;
  return MODEL_CONTEXT_WINDOWS[modelId as OwnModelId];
}
