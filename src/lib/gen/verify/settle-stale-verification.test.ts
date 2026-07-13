import { beforeEach, describe, expect, it, vi } from "vitest";

import { STALE_VERIFICATION_TIMEOUT_MS } from "@/lib/gen/defaults";

const failVersionVerificationIfUnleased = vi.fn();
const leaseTableExists = vi.fn();

// Mock the DB module so importing the settle helper does not require a live
// connection (`@/lib/db/chat-repository-pg` throws at import time otherwise).
vi.mock("@/lib/db/chat-repository-pg", () => ({
  failVersionVerificationIfUnleased: (...args: unknown[]) =>
    failVersionVerificationIfUnleased(...args),
  leaseTableExists: (...args: unknown[]) => leaseTableExists(...args),
}));

import { settleStaleVerificationIfNeeded } from "./settle-stale-verification";

type TestVersion = Parameters<typeof settleStaleVerificationIfNeeded>[0];

function makeVersion(overrides: Record<string, unknown> = {}): TestVersion {
  return {
    id: "v1",
    verification_state: "verifying",
    created_at: new Date(Date.now() - STALE_VERIFICATION_TIMEOUT_MS - 10_000).toISOString(),
    ...overrides,
  } as unknown as TestVersion;
}

beforeEach(() => {
  failVersionVerificationIfUnleased.mockReset();
  leaseTableExists.mockReset();
});

describe("settleStaleVerificationIfNeeded", () => {
  it("no-ops for a fresh (non-stale) version", async () => {
    const v = makeVersion({ created_at: new Date().toISOString() });
    const res = await settleStaleVerificationIfNeeded(v);
    expect(res.failed).toBe(false);
    expect(res.version).toBe(v);
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
  });

  it("NEVER fails a stale pending design preview (Codex/Vercel #337 P1)", async () => {
    const v = makeVersion({ verification_state: "pending", lifecycle_stage: "design" });
    const res = await settleStaleVerificationIfNeeded(v);
    expect(res.failed).toBe(false);
    expect(res.version).toBe(v);
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
  });

  it("NEVER fails a stale pending row with no lifecycle_stage (legacy → treated as design)", async () => {
    const v = makeVersion({ verification_state: "pending", lifecycle_stage: null });
    const res = await settleStaleVerificationIfNeeded(v);
    expect(res.failed).toBe(false);
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
  });

  it("DOES fail a stale pending integrations row (server-verify was expected)", async () => {
    failVersionVerificationIfUnleased.mockResolvedValue(
      makeVersion({ verification_state: "failed" }),
    );
    const res = await settleStaleVerificationIfNeeded(
      makeVersion({ verification_state: "pending", lifecycle_stage: "integrations" }),
    );
    expect(res.failed).toBe(true);
    expect(failVersionVerificationIfUnleased).toHaveBeenCalledOnce();
  });

  it("DOES fail a stale verifying design row (verify actually started)", async () => {
    failVersionVerificationIfUnleased.mockResolvedValue(
      makeVersion({ verification_state: "failed" }),
    );
    const res = await settleStaleVerificationIfNeeded(
      makeVersion({ verification_state: "verifying", lifecycle_stage: "design" }),
    );
    expect(res.failed).toBe(true);
    expect(failVersionVerificationIfUnleased).toHaveBeenCalledOnce();
  });

  it("fails a stale verifying version (lease-safe) and returns the updated row", async () => {
    const updated = makeVersion({ verification_state: "failed" });
    failVersionVerificationIfUnleased.mockResolvedValue(updated);
    const res = await settleStaleVerificationIfNeeded(makeVersion());
    expect(res.failed).toBe(true);
    expect(res.version).toBe(updated);
    expect(failVersionVerificationIfUnleased).toHaveBeenCalledOnce();
  });

  it("keeps the version unchanged when the lease guard no-ops the fail", async () => {
    failVersionVerificationIfUnleased.mockResolvedValue(null);
    const v = makeVersion();
    const res = await settleStaleVerificationIfNeeded(v);
    expect(res.failed).toBe(false);
    expect(res.version).toBe(v);
  });

  it("skips a stale 'repairing' row when the lease table is absent (legacy fallback)", async () => {
    leaseTableExists.mockResolvedValue(false);
    const res = await settleStaleVerificationIfNeeded(
      makeVersion({ verification_state: "repairing" }),
    );
    expect(res.failed).toBe(false);
    expect(leaseTableExists).toHaveBeenCalledOnce();
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
  });

  it("fails a stale 'repairing' row once the lease table exists", async () => {
    leaseTableExists.mockResolvedValue(true);
    failVersionVerificationIfUnleased.mockResolvedValue(
      makeVersion({ verification_state: "failed" }),
    );
    const res = await settleStaleVerificationIfNeeded(
      makeVersion({ verification_state: "repairing" }),
    );
    expect(res.failed).toBe(true);
    expect(failVersionVerificationIfUnleased).toHaveBeenCalledOnce();
  });

  it("prefers the resolved concrete failure summary over the generic copy", async () => {
    failVersionVerificationIfUnleased.mockResolvedValue(
      makeVersion({ verification_state: "failed" }),
    );
    await settleStaleVerificationIfNeeded(makeVersion(), {
      resolveFailureSummary: () => "Typecheck misslyckades: X",
    });
    expect(failVersionVerificationIfUnleased).toHaveBeenCalledWith("v1", "Typecheck misslyckades: X");
  });

  it("falls back to the generic summary when no concrete one is resolved", async () => {
    failVersionVerificationIfUnleased.mockResolvedValue(
      makeVersion({ verification_state: "failed" }),
    );
    await settleStaleVerificationIfNeeded(makeVersion(), {
      resolveFailureSummary: () => null,
    });
    const [, summary] = failVersionVerificationIfUnleased.mock.calls[0];
    expect(String(summary)).toContain("tog för lång tid");
  });

  it("still settles (generic summary) when resolveFailureSummary throws (Bugbot #337)", async () => {
    failVersionVerificationIfUnleased.mockResolvedValue(
      makeVersion({ verification_state: "failed" }),
    );
    const res = await settleStaleVerificationIfNeeded(makeVersion(), {
      resolveFailureSummary: async () => {
        throw new Error("transient log-read failure");
      },
    });
    expect(res.failed).toBe(true);
    expect(failVersionVerificationIfUnleased).toHaveBeenCalledOnce();
    const [, summary] = failVersionVerificationIfUnleased.mock.calls[0];
    expect(String(summary)).toContain("tog för lång tid");
  });

  // BB#299 / M#vlane2: a stale row whose latest gate verdict already passed must
  // NOT be terminal-failed — a transient promote-UPDATE timeout (prod incident
  // 2026-07-13) merely left it spinning at `verifying`. Reconcile by no-op.
  it("reconciles (no-op) a stale verifying row whose latest gate verdict is green (BB#299)", async () => {
    const res = await settleStaleVerificationIfNeeded(makeVersion(), {
      resolveLatestGateGreen: () => true,
    });
    expect(res.failed).toBe(false);
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
  });

  it("reconciles (no-op) a stale row stuck via promoteGuardUnavailable when the gate is green (async resolver)", async () => {
    const res = await settleStaleVerificationIfNeeded(
      makeVersion({ verification_state: "verifying" }),
      { resolveLatestGateGreen: async () => true },
    );
    expect(res.failed).toBe(false);
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
  });

  // Codex P1 (#518): a proven-green stale row must reach a TERMINAL state, not
  // linger in `verifying` forever. When a guarded promote is threaded and takes,
  // the watchdog returns the promoted row.
  it("promotes a stale green row to terminal via the guarded promote callback (Codex P1 #518)", async () => {
    const promotedRow = makeVersion({
      verification_state: "passed",
      release_state: "promoted",
    });
    const promoteReconciledVersion = vi.fn().mockResolvedValue(promotedRow);
    const res = await settleStaleVerificationIfNeeded(makeVersion(), {
      resolveLatestGateGreen: () => true,
      promoteReconciledVersion,
    });
    expect(promoteReconciledVersion).toHaveBeenCalledOnce();
    expect(res.failed).toBe(false);
    expect(res.version).toBe(promotedRow);
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
  });

  it("no-ops (never fails) a green row when the guarded promote is declined/transient (returns null)", async () => {
    const v = makeVersion();
    const promoteReconciledVersion = vi.fn().mockResolvedValue(null);
    const res = await settleStaleVerificationIfNeeded(v, {
      resolveLatestGateGreen: () => true,
      promoteReconciledVersion,
    });
    expect(promoteReconciledVersion).toHaveBeenCalledOnce();
    expect(res.failed).toBe(false);
    expect(res.version).toBe(v);
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
  });

  it("no-ops (never fails) a green row when the guarded promote throws", async () => {
    const v = makeVersion();
    const promoteReconciledVersion = vi.fn().mockRejectedValue(new Error("db timeout"));
    const res = await settleStaleVerificationIfNeeded(v, {
      resolveLatestGateGreen: () => true,
      promoteReconciledVersion,
    });
    expect(promoteReconciledVersion).toHaveBeenCalledOnce();
    expect(res.failed).toBe(false);
    expect(res.version).toBe(v);
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
  });

  it("does NOT attempt promotion when the gate is not green (no callback invocation, fails as today)", async () => {
    failVersionVerificationIfUnleased.mockResolvedValue(
      makeVersion({ verification_state: "failed" }),
    );
    const promoteReconciledVersion = vi.fn();
    const res = await settleStaleVerificationIfNeeded(makeVersion(), {
      resolveLatestGateGreen: () => false,
      promoteReconciledVersion,
    });
    expect(promoteReconciledVersion).not.toHaveBeenCalled();
    expect(res.failed).toBe(true);
    expect(failVersionVerificationIfUnleased).toHaveBeenCalledOnce();
  });

  it("still fails a stale verifying row when the latest gate verdict is NOT green (no passing gate log)", async () => {
    failVersionVerificationIfUnleased.mockResolvedValue(
      makeVersion({ verification_state: "failed" }),
    );
    const res = await settleStaleVerificationIfNeeded(makeVersion(), {
      resolveLatestGateGreen: () => false,
    });
    expect(res.failed).toBe(true);
    expect(failVersionVerificationIfUnleased).toHaveBeenCalledOnce();
  });

  it("still fails when the green reconciliation resolver throws (best-effort, falls through)", async () => {
    failVersionVerificationIfUnleased.mockResolvedValue(
      makeVersion({ verification_state: "failed" }),
    );
    const res = await settleStaleVerificationIfNeeded(makeVersion(), {
      resolveLatestGateGreen: async () => {
        throw new Error("transient log-read failure");
      },
    });
    expect(res.failed).toBe(true);
    expect(failVersionVerificationIfUnleased).toHaveBeenCalledOnce();
  });
});
