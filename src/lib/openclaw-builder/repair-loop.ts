/**
 * Bounded observe→repair counter for OpenClaw Builder preview rounds.
 * Pure except a job-keyed in-memory budget: no I/O, no env, no reset helper.
 * Retry must not refill the budget for the same jobId.
 */

const MAX_PREVIEW_LOOPS = 2 as const;
const usedByJob = new Map<string, number>();

export type RepairLoopState = {
  jobId: string;
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

function isJobId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function publicState(jobId: string, used: number): RepairLoopState {
  return {
    jobId,
    previewLoopsUsed: used,
    maxPreviewLoops: MAX_PREVIEW_LOOPS,
  };
}

export function createRepairLoop(jobId: string): RepairLoopState {
  if (!isJobId(jobId)) {
    return publicState("", 0);
  }
  const used = usedByJob.get(jobId) ?? 0;
  return publicState(jobId, used);
}

export function notePreviewRepair(state: RepairLoopState): RepairLoopDecision {
  if (!isRecord(state)) return INVALID;
  if (!isJobId(state.jobId)) return INVALID;
  if (!isValidUsed(state.previewLoopsUsed)) return INVALID;
  if (state.maxPreviewLoops !== MAX_PREVIEW_LOOPS) return INVALID;

  const stored = usedByJob.get(state.jobId) ?? 0;
  const used = Math.max(stored, state.previewLoopsUsed);
  if (used >= MAX_PREVIEW_LOOPS) {
    usedByJob.set(state.jobId, used);
    return EXHAUSTED;
  }

  const nextUsed = used + 1;
  usedByJob.set(state.jobId, nextUsed);
  const next = publicState(state.jobId, nextUsed);

  if (nextUsed === 1) {
    return { ok: true, state: next, action: "repair" };
  }
  return { ok: true, state: next, action: "submit_best" };
}
