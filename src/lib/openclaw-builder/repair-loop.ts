/**
 * Bounded observe→repair counter for OpenClaw Builder preview rounds.
 * Pure: no I/O, no env, no reset helper. Retry must not refill the budget.
 */

const MAX_PREVIEW_LOOPS = 2 as const;

export type RepairLoopState = {
  previewLoopsUsed: number;
  maxPreviewLoops: 2;
};

export type RepairLoopDecision =
  | {
      ok: true;
      state: RepairLoopState;
      action: "repair" | "submit_best" | "fallback_classic";
    }
  | { ok: false; code: "budget_exhausted" | "invalid_state" };

const INVALID: RepairLoopDecision = { ok: false, code: "invalid_state" };
const EXHAUSTED: RepairLoopDecision = { ok: false, code: "budget_exhausted" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidUsed(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function createRepairLoop(): RepairLoopState {
  return {
    previewLoopsUsed: 0,
    maxPreviewLoops: MAX_PREVIEW_LOOPS,
  };
}

export function notePreviewRepair(state: RepairLoopState): RepairLoopDecision {
  if (!isRecord(state)) return INVALID;
  if (!isValidUsed(state.previewLoopsUsed)) return INVALID;
  if (state.maxPreviewLoops !== MAX_PREVIEW_LOOPS) return INVALID;

  const used = state.previewLoopsUsed;
  if (used >= MAX_PREVIEW_LOOPS) return EXHAUSTED;

  const nextUsed = used + 1;
  const next: RepairLoopState = {
    previewLoopsUsed: nextUsed,
    maxPreviewLoops: MAX_PREVIEW_LOOPS,
  };

  if (nextUsed === 1) {
    return { ok: true, state: next, action: "repair" };
  }
  return { ok: true, state: next, action: "submit_best" };
}
