import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

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

describe("updateVersionPreviewUrl atomic revision/holder fence", () => {
  const dialect = new PgDialect();
  let statements: Array<{ sql: string; params: unknown[] }>;
  let rows: number;
  beforeEach(() => {
    transaction.mockReset();
    plainUpdate.mockReset();
    statements = [];
    rows = 1;
    transaction.mockImplementation(async (run: (tx: unknown) => Promise<boolean>) => run({
      execute: async (query: SQL) => { statements.push(dialect.sqlToQuery(query)); },
      update: () => ({ set: () => ({ where: async (query: SQL) => {
        statements.push(dialect.sqlToQuery(query));
        return { rowCount: rows };
      } }) }),
    }));
  });

  it("locks before the separate guarded statement; same holder AND revision are required", async () => {
    expect(await updateVersionPreviewUrl("version", "https://preview", {
      holderRunId: "holder", expectedFilesRevision: "rev", lockTimeoutMs: 2000,
    })).toBe(true);
    expect(statements).toHaveLength(3);
    expect(statements[1].sql.toLowerCase()).toContain("for update");
    const where = statements[2];
    expect(where.sql).toContain("files_revision");
    expect(where.sql).toContain("EXISTS");
    expect(where.sql).toContain("lease_expires_at > now()");
    expect(where.params).toEqual(expect.arrayContaining(["version", "holder", "rev"]));
    expect(plainUpdate).not.toHaveBeenCalled();
  });

  it.each(["stale revision", "lost/expired holder"])("%s no-op returns false without retry", async () => {
    rows = 0;
    expect(await updateVersionPreviewUrl("version", "https://preview", {
      holderRunId: "holder", expectedFilesRevision: "rev", lockTimeoutMs: 2000, maxRetries: 3,
    })).toBe(false);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(statements[2].params).toEqual(expect.arrayContaining(["holder", "rev"]));
  });

  it("also fences the ordinary awaited path with lock-then-second-statement", async () => {
    expect(await updateVersionPreviewUrl("version", "https://preview", {
      holderRunId: "holder", expectedFilesRevision: "rev",
    })).toBe(true);
    expect(statements[1].sql.toLowerCase()).toContain("for update");
    expect(statements[2].params).toEqual(expect.arrayContaining(["holder", "rev"]));
    expect(plainUpdate).not.toHaveBeenCalled();
  });

  it("revision-only HTTP bookkeeping remains atomically revision-bound", async () => {
    await updateVersionPreviewUrl("version", "https://preview", { expectedFilesRevision: "rev" });
    expect(statements[2].sql).toContain("files_revision");
    expect(statements[2].sql).not.toContain("engine_version_jobs");
  });

  it.each([{ holderRunId: "" }, { expectedFilesRevision: " " }])("empty fence %j never degrades to plain write", async (options) => {
    expect(await updateVersionPreviewUrl("version", "https://preview", options)).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
    expect(plainUpdate).not.toHaveBeenCalled();
  });

  it("keeps bounded lock-timeout retry with fences", async () => {
    transaction.mockRejectedValueOnce(lockTimeoutError());
    expect(await updateVersionPreviewUrl("version", "https://preview", {
      holderRunId: "holder", expectedFilesRevision: "rev", lockTimeoutMs: 2000, maxRetries: 1, retryDelayMs: 1,
    })).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(statements[2].params).toEqual(expect.arrayContaining(["holder", "rev"]));
  });
});
