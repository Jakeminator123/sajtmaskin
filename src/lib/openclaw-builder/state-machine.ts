export const BUILDER_JOB_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "stale",
  "cancelled",
  "superseded",
  "expired",
] as const;
export type BuilderJobStatus = (typeof BUILDER_JOB_STATUSES)[number];

export const BUILDER_JOB_TERMINAL_STATUSES = [
  "completed",
  "failed",
  "stale",
  "cancelled",
  "superseded",
  "expired",
] as const satisfies readonly BuilderJobStatus[];

export type BuilderJobEvent =
  | "start"
  | "complete"
  | "fail"
  | "mark_stale"
  | "cancel"
  | "supersede"
  | "expire";

const transitions: Record<BuilderJobStatus, Partial<Record<BuilderJobEvent, BuilderJobStatus>>> = {
  pending: { start: "running", cancel: "cancelled", supersede: "superseded", expire: "expired" },
  running: {
    complete: "completed",
    fail: "failed",
    mark_stale: "stale",
    cancel: "cancelled",
    supersede: "superseded",
    expire: "expired",
  },
  completed: {},
  failed: {},
  stale: {},
  cancelled: {},
  superseded: {},
  expired: {},
};

export type BuilderTransitionDecision =
  | { outcome: "applied"; from: BuilderJobStatus; to: BuilderJobStatus }
  | { outcome: "idempotent"; from: BuilderJobStatus; to: BuilderJobStatus }
  | { outcome: "rejected"; from: BuilderJobStatus; reason: "invalid_transition" | "terminal" };

export function transitionBuilderJob(
  status: BuilderJobStatus,
  event: BuilderJobEvent,
): BuilderTransitionDecision {
  const target = transitions[status][event];
  if (target) return { outcome: "applied", from: status, to: target };
  const terminal = (BUILDER_JOB_TERMINAL_STATUSES as readonly BuilderJobStatus[]).includes(status);
  const sameTerminalEvent =
    (status === "completed" && event === "complete") ||
    (status === "failed" && event === "fail") ||
    (status === "stale" && event === "mark_stale") ||
    (status === "cancelled" && event === "cancel") ||
    (status === "superseded" && event === "supersede") ||
    (status === "expired" && event === "expire");
  if (sameTerminalEvent) return { outcome: "idempotent", from: status, to: status };
  return { outcome: "rejected", from: status, reason: terminal ? "terminal" : "invalid_transition" };
}

export type BuilderRetryDecision =
  | { outcome: "wait" }
  | { outcome: "create_new_job"; retryOfStatus: "failed" | "stale" | "superseded" | "expired" }
  | { outcome: "not_retryable"; reason: "completed" | "cancelled" | "attempt_budget_exhausted" };

export function decideBuilderRetry(input: {
  status: BuilderJobStatus;
  attempt: number;
  maxAttempts: number;
}): BuilderRetryDecision {
  if (input.status === "pending" || input.status === "running") return { outcome: "wait" };
  if (input.status === "completed" || input.status === "cancelled") {
    return { outcome: "not_retryable", reason: input.status };
  }
  if (input.attempt >= input.maxAttempts) {
    return { outcome: "not_retryable", reason: "attempt_budget_exhausted" };
  }
  return { outcome: "create_new_job", retryOfStatus: input.status };
}

export function evaluateBuilderLease(input: {
  status: BuilderJobStatus;
  nowMs: number;
  expiresAtMs: number;
  absoluteExpiresAtMs: number;
  requestedExtensionMs: number;
}):
  | { outcome: "extended"; expiresAtMs: number }
  | { outcome: "expired" }
  | { outcome: "rejected"; reason: "not_running" | "absolute_limit" } {
  if (input.status !== "running") return { outcome: "rejected", reason: "not_running" };
  if (input.nowMs >= input.expiresAtMs || input.nowMs >= input.absoluteExpiresAtMs) {
    return { outcome: "expired" };
  }
  const nextExpiry = Math.min(
    input.absoluteExpiresAtMs,
    Math.max(input.expiresAtMs, input.nowMs + Math.max(0, input.requestedExtensionMs)),
  );
  if (nextExpiry <= input.expiresAtMs) return { outcome: "rejected", reason: "absolute_limit" };
  return { outcome: "extended", expiresAtMs: nextExpiry };
}

export function evaluateBuilderBase(
  expected: { baseVersionId: string; baseFilesRevision: string },
  current: { versionId: string; filesRevision: string },
): "current" | "stale_version" | "stale_revision" {
  if (expected.baseVersionId !== current.versionId) return "stale_version";
  if (expected.baseFilesRevision !== current.filesRevision) return "stale_revision";
  return "current";
}

export type BuilderResultAcceptance = {
  idempotencyKey: string;
  candidateHash: string;
  resultId: string;
};

export function decideBuilderResultAcceptance(
  existing: BuilderResultAcceptance | null,
  proposed: BuilderResultAcceptance,
): "accepted" | "replayed" | "idempotency_conflict" | "duplicate_result" {
  if (!existing) return "accepted";
  if (existing.idempotencyKey !== proposed.idempotencyKey) return "duplicate_result";
  if (
    existing.candidateHash === proposed.candidateHash &&
    existing.resultId === proposed.resultId
  ) {
    return "replayed";
  }
  return "idempotency_conflict";
}
