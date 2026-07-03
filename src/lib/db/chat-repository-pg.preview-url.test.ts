import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// M#pv2 (prod-incident chat 3120c05c v1): updateVersionPreviewUrl's best-effort
// write used to skip the persist on the FIRST row-lock contention against the
// quality-gate's `acquireVersionLease` (`FOR UPDATE`). A preview session that
// consistently coincided with the verify lease therefore left `preview_url`
// null forever. The bounded retry rides over the brief lease/verify row lock so
// the idempotent URL lands — while staying bounded (no busy-wait) and
// best-effort (never throws).
//
// We mock the drizzle `db` so `db.transaction` can throw a lock-timeout
// (Postgres 55P03) a controllable number of times before succeeding.

const transaction = vi.hoisted(() => vi.fn());
const plainUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    transaction,
    update: () => ({
      set: () => ({ where: () => plainUpdate() }),
    }),
  },
}));

import { updateVersionPreviewUrl } from "./chat-repository-pg";

function lockTimeoutError(): Error {
  return Object.assign(new Error("canceling statement due to lock timeout"), {
    code: "55P03",
  });
}

describe("updateVersionPreviewUrl bounded retry under verify-lease contention (M#pv2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("persists on the first attempt when the row is not contended", async () => {
    transaction.mockResolvedValueOnce(true);

    const ok = await updateVersionPreviewUrl("ver-1", "https://preview", {
      lockTimeoutMs: 2000,
      maxRetries: 3,
      retryDelayMs: 1,
    });

    expect(ok).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("retries after lease-release contention and persists once the lock frees", async () => {
    transaction
      .mockRejectedValueOnce(lockTimeoutError())
      .mockRejectedValueOnce(lockTimeoutError())
      .mockResolvedValueOnce(true);

    const ok = await updateVersionPreviewUrl("ver-1", "https://preview", {
      lockTimeoutMs: 2000,
      maxRetries: 3,
      retryDelayMs: 1,
    });

    expect(ok).toBe(true);
    // 2 contended attempts + 1 success = 3 total (bounded, < maxRetries+1).
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it("gives up best-effort after a bounded number of contended attempts (never throws)", async () => {
    transaction.mockRejectedValue(lockTimeoutError());

    const ok = await updateVersionPreviewUrl("ver-1", "https://preview", {
      lockTimeoutMs: 2000,
      maxRetries: 3,
      retryDelayMs: 1,
    });

    expect(ok).toBe(false);
    // maxRetries(3) + the initial attempt = exactly 4 — bounded, no busy-wait.
    expect(transaction).toHaveBeenCalledTimes(4);
  });

  it("does NOT retry a missing row (rowCount 0 is not contention)", async () => {
    transaction.mockResolvedValueOnce(false);

    const ok = await updateVersionPreviewUrl("ver-missing", "https://preview", {
      lockTimeoutMs: 2000,
      maxRetries: 3,
      retryDelayMs: 1,
    });

    expect(ok).toBe(false);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a non-lock error (best-effort give-up)", async () => {
    transaction.mockRejectedValue(new Error("connection reset"));

    const ok = await updateVersionPreviewUrl("ver-1", "https://preview", {
      lockTimeoutMs: 2000,
      maxRetries: 3,
      retryDelayMs: 1,
    });

    expect(ok).toBe(false);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("without lockTimeoutMs uses the plain blocking write (no retry path)", async () => {
    plainUpdate.mockResolvedValueOnce({ rowCount: 1 });

    const ok = await updateVersionPreviewUrl("ver-1", "https://preview");

    expect(ok).toBe(true);
    expect(transaction).not.toHaveBeenCalled();
  });
});
