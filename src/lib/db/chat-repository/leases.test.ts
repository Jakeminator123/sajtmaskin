import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const execute = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const selectLimit = vi.hoisted(() => vi.fn());

const selectChain = {
  from: () => selectChain,
  where: () => selectChain,
  limit: (...args: unknown[]) => selectLimit(...args),
};

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    execute: (...args: unknown[]) => execute(...args),
    transaction: (cb: (tx: unknown) => unknown) => transaction(cb),
    select: () => selectChain,
    update: () => ({ set: () => ({ where: () => Promise.resolve({ rowCount: 0 }) }) }),
  },
}));

import {
  acquireVersionLease,
  hasActiveVersionLease,
  leaseTableExists,
} from "./leases";

function renderSql(value: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PgDialect().sqlToQuery(value as any).sql.toLowerCase();
}

describe("leaseTableExists — tri-state (L4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns exists when to_regclass returns a non-null oid", async () => {
    execute.mockResolvedValue({ rows: [{ oid: "16384" }] });
    expect(await leaseTableExists()).toBe("exists");
  });

  it("returns missing when to_regclass returns NULL without error", async () => {
    execute.mockResolvedValue({ rows: [{ oid: null }] });
    expect(await leaseTableExists()).toBe("missing");
  });

  it("returns unavailable when the probe throws", async () => {
    execute.mockRejectedValue(new Error("connection reset"));
    expect(await leaseTableExists()).toBe("unavailable");
  });

  it("returns unavailable when the probe returns no row (not a NULL oid)", async () => {
    execute.mockResolvedValue({ rows: [] });
    expect(await leaseTableExists()).toBe("unavailable");
  });
});

describe("hasActiveVersionLease — fail-closed on query error (L4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when a live lease row exists", async () => {
    selectLimit.mockResolvedValue([{ id: "job-1" }]);
    expect(await hasActiveVersionLease("ver-1")).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns false when the table is definitively missing", async () => {
    selectLimit.mockRejectedValue(new Error('relation "engine_version_jobs" does not exist'));
    execute.mockResolvedValue({ rows: [{ oid: null }] });
    expect(await hasActiveVersionLease("ver-1")).toBe(false);
  });

  it("throws when the query fails and the probe is unavailable", async () => {
    selectLimit.mockRejectedValue(new Error("connection reset"));
    execute.mockRejectedValue(new Error("connection reset"));
    await expect(hasActiveVersionLease("ver-1")).rejects.toThrow("connection reset");
  });

  it("throws when the query fails and the probe returns no row (unavailable, not missing)", async () => {
    selectLimit.mockRejectedValue(new Error("connection reset"));
    execute.mockResolvedValue({ rows: [] });
    await expect(hasActiveVersionLease("ver-1")).rejects.toThrow("connection reset");
  });
});

describe("acquireVersionLease — exactly one owner (L4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gives exactly one winner when two acquires serialize on the same version", async () => {
    let held = false;
    let chain = Promise.resolve();
    transaction.mockImplementation((cb: (tx: { execute: (sql: unknown) => Promise<unknown> }) => unknown) => {
      const run = chain.then(async () => {
        const tx = {
          execute: async (sqlObj: unknown) => {
            const rendered = renderSql(sqlObj);
            if (rendered.includes("insert into engine_version_jobs")) {
              if (held) return { rows: [] };
              held = true;
              return { rows: [{ run_id: "winner" }] };
            }
            return { rows: [{}] };
          },
        };
        return cb(tx);
      });
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    });

    const [a, b] = await Promise.all([
      acquireVersionLease("ver-1", "server_verify"),
      acquireVersionLease("ver-1", "manual_repair"),
    ]);
    const winners = [a, b].filter((lease): lease is { runId: string } => lease != null);
    expect(winners).toHaveLength(1);
    expect(winners[0].runId).toBeTruthy();
    const losers = [a, b].filter((lease) => lease == null);
    expect(losers).toHaveLength(1);
  });
});
