import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Codex P2 (auto-accept guard): the active-lease check must live in the SHARED
// accept path (maybeAutoAcceptTimedOutRepair), not only on POST /accept-repair,
// so polling/readiness/versions auto-accept can't promote a row out from under
// a still-running verify/repair job that holds the lease.
//
// We mock the drizzle `db` so hasActiveVersionLease's SELECT can return either a
// live lease row or none, and assert that acceptRepair (db.transaction) only
// runs when no active lease exists.

const limit = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const execute = vi.hoisted(() => vi.fn());

const selectChain = {
  from: () => selectChain,
  where: () => selectChain,
  limit,
} as const;

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    select: () => selectChain,
    transaction,
    execute: (...args: unknown[]) => execute(...args),
    update: () => ({ set: () => ({ where: () => Promise.resolve({ rowCount: 0 }) }) }),
  },
}));

import { maybeAutoAcceptTimedOutRepair } from "./chat-repository-pg";

function timedOutRepairVersion() {
  // repair_available + repairAvailableAt well past the accept-timeout so
  // shouldAutoAcceptRepair() returns true and we reach the lease guard.
  return {
    id: "ver-1",
    verification_state: "repair_available",
    repair_available_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  } as unknown as Parameters<typeof maybeAutoAcceptTimedOutRepair>[0];
}

describe("maybeAutoAcceptTimedOutRepair — shared-path active-lease guard (Codex P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockResolvedValue({ rows: [{ oid: "16384" }] });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT auto-accept while an active lease exists (and never enters acceptRepair)", async () => {
    limit.mockResolvedValue([{ id: "job-1" }]); // hasActiveVersionLease -> true

    const result = await maybeAutoAcceptTimedOutRepair(timedOutRepairVersion());

    expect(result.wasAutoAccepted).toBe(false);
    // The guard short-circuits BEFORE acceptRepair's transaction runs.
    expect(transaction).not.toHaveBeenCalled();
  });

  it("proceeds to acceptRepair when no active lease is held", async () => {
    limit.mockResolvedValue([]); // hasActiveVersionLease -> false
    transaction.mockResolvedValue(null); // acceptRepair finds nothing to accept

    const result = await maybeAutoAcceptTimedOutRepair(timedOutRepairVersion());

    expect(result.wasAutoAccepted).toBe(false);
    // No active lease -> the guard lets the accept path run.
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-accept when the lease query is unavailable (fail-closed)", async () => {
    limit.mockRejectedValue(new Error("connection reset"));
    execute.mockRejectedValue(new Error("connection reset"));

    const result = await maybeAutoAcceptTimedOutRepair(timedOutRepairVersion());

    expect(result.wasAutoAccepted).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("does NOT auto-accept when acceptRepair reports lease_unavailable after a clean pre-check", async () => {
    limit.mockResolvedValue([]); // hasActiveVersionLease -> false
    execute.mockRejectedValue(new Error("connection reset")); // acceptRepair probe

    const result = await maybeAutoAcceptTimedOutRepair(timedOutRepairVersion());

    expect(result.wasAutoAccepted).toBe(false);
    expect(result.version.id).toBe("ver-1");
    expect(transaction).not.toHaveBeenCalled();
  });
});
