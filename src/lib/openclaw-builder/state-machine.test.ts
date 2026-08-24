import { describe, expect, it } from "vitest";

import {
  decideBuilderResultAcceptance,
  decideBuilderRetry,
  evaluateBuilderBase,
  evaluateBuilderLease,
  transitionBuilderJob,
} from "./state-machine";

describe("OpenClaw Builder job state", () => {
  it("makes completion, cancellation, stale and expiry terminal and unambiguous", () => {
    expect(transitionBuilderJob("pending", "start")).toEqual({
      outcome: "applied",
      from: "pending",
      to: "running",
    });
    expect(transitionBuilderJob("running", "mark_stale")).toMatchObject({ to: "stale" });
    expect(transitionBuilderJob("running", "cancel")).toMatchObject({ to: "cancelled" });
    expect(transitionBuilderJob("running", "expire")).toMatchObject({ to: "expired" });
    expect(transitionBuilderJob("completed", "complete").outcome).toBe("idempotent");
    expect(transitionBuilderJob("cancelled", "start")).toEqual({
      outcome: "rejected",
      from: "cancelled",
      reason: "terminal",
    });
  });

  it("creates a new job only for retryable outcomes and obeys the attempt cap", () => {
    expect(decideBuilderRetry({ status: "failed", attempt: 1, maxAttempts: 3 })).toEqual({
      outcome: "create_new_job",
      retryOfStatus: "failed",
    });
    expect(decideBuilderRetry({ status: "stale", attempt: 3, maxAttempts: 3 })).toEqual({
      outcome: "not_retryable",
      reason: "attempt_budget_exhausted",
    });
    expect(decideBuilderRetry({ status: "completed", attempt: 3, maxAttempts: 3 })).toEqual({
      outcome: "not_retryable",
      reason: "completed",
    });
    expect(decideBuilderRetry({ status: "running", attempt: 1, maxAttempts: 3 })).toEqual({
      outcome: "wait",
    });
  });

  it("never revives an expired lease or extends beyond the absolute deadline", () => {
    expect(
      evaluateBuilderLease({
        status: "running",
        nowMs: 1_000,
        expiresAtMs: 1_000,
        absoluteExpiresAtMs: 2_000,
        requestedExtensionMs: 500,
      }),
    ).toEqual({ outcome: "expired" });
    expect(
      evaluateBuilderLease({
        status: "running",
        nowMs: 1_000,
        expiresAtMs: 1_500,
        absoluteExpiresAtMs: 1_800,
        requestedExtensionMs: 5_000,
      }),
    ).toEqual({ outcome: "extended", expiresAtMs: 1_800 });
    expect(
      evaluateBuilderLease({
        status: "expired",
        nowMs: 1_000,
        expiresAtMs: 1_500,
        absoluteExpiresAtMs: 1_800,
        requestedExtensionMs: 100,
      }),
    ).toEqual({ outcome: "rejected", reason: "not_running" });
  });

  it("detects stale bases and makes result replay idempotent", () => {
    expect(
      evaluateBuilderBase(
        { baseVersionId: "v1", baseFilesRevision: "r1" },
        { versionId: "v2", filesRevision: "r1" },
      ),
    ).toBe("stale_version");
    expect(
      evaluateBuilderBase(
        { baseVersionId: "v1", baseFilesRevision: "r1" },
        { versionId: "v1", filesRevision: "r2" },
      ),
    ).toBe("stale_revision");

    const accepted = { idempotencyKey: "i1", candidateHash: "h1", resultId: "r1" };
    expect(decideBuilderResultAcceptance(null, accepted)).toBe("accepted");
    expect(decideBuilderResultAcceptance(accepted, accepted)).toBe("replayed");
    expect(
      decideBuilderResultAcceptance(accepted, { ...accepted, candidateHash: "h2" }),
    ).toBe("idempotency_conflict");
    expect(
      decideBuilderResultAcceptance(accepted, { ...accepted, idempotencyKey: "i2" }),
    ).toBe("duplicate_result");
  });
});
