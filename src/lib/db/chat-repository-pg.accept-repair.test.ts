import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// Codex P2 (round 3) regression evidence for acceptRepair + renewVersionLease.
//
// We mock the drizzle `db` so we can CAPTURE the exact SET object and WHERE SQL
// the production code builds, then render them with PgDialect and assert the
// predicates that close the three findings:
//
//   1. accept promotes the CURRENT pending repair (column ref), not the value
//      SELECTed earlier — no stale repaired_files_json resurrection.
//   2. accept stays backward-compatible before add-engine-version-jobs.sql is
//      applied (to_regclass(...) IS NULL fail-safe) instead of throwing.
//   3. renewVersionLease refuses an already-expired lease (lease_expires_at >
//      now() predicate) so a frozen run can't re-extend lost ownership.

const transaction = vi.hoisted(() => vi.fn());
const acceptSetCapture = vi.hoisted(() => ({ value: undefined as unknown }));
const acceptWhereCapture = vi.hoisted(() => ({ value: undefined as unknown }));
const renewWhereCapture = vi.hoisted(() => ({ value: undefined as unknown }));

// Fake transaction handle: SELECT returns a non-empty pending repair so we reach
// the UPDATE; the UPDATE captures set+where and reports rowCount 0 so acceptRepair
// returns before the final row re-SELECT (keeps the fake minimal).
const tx = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([{ repairedFilesJson: '{"src/app/page.tsx":"x"}' }]),
      }),
    }),
  }),
  update: () => ({
    set: (s: unknown) => {
      acceptSetCapture.value = s;
      return {
        where: (w: unknown) => {
          acceptWhereCapture.value = w;
          return Promise.resolve({ rowCount: 0 });
        },
      };
    },
  }),
};

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    transaction: (cb: (t: typeof tx) => unknown) => {
      transaction();
      return cb(tx);
    },
    // renewVersionLease uses db.update(...).set(...).where(...)
    update: () => ({
      set: () => ({
        where: (w: unknown) => {
          renewWhereCapture.value = w;
          return Promise.resolve({ rowCount: 0 });
        },
      }),
    }),
  },
}));

// Keep the false-green promote guard out of the way: it has its own test suite.
vi.mock("./promote-guard", () => ({
  assertPromoteAllowed: vi.fn(async () => ({ allowed: true, reason: null })),
}));

import { acceptRepair, renewVersionLease } from "./chat-repository-pg";

function renderSql(value: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PgDialect().sqlToQuery(value as any).sql.toLowerCase();
}

describe("acceptRepair — round-3 atomic promote + missing-table fail-safe (Codex P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acceptSetCapture.value = undefined;
    acceptWhereCapture.value = undefined;
  });
  afterEach(() => vi.clearAllMocks());

  it("promotes the CURRENT pending repair via a column reference, not the SELECTed snapshot", async () => {
    await acceptRepair("ver-1");
    expect(transaction).toHaveBeenCalledTimes(1);

    const set = acceptSetCapture.value as Record<string, unknown>;
    // Stale-payload fix: filesJson is a SQL column reference, NOT the JS string
    // read by the earlier SELECT.
    expect(typeof set.filesJson).not.toBe("string");
    expect(renderSql(set.filesJson)).toContain("repaired_files_json");
  });

  it("binds the UPDATE to a still-pending repair AND degrades safely when the jobs table is absent", async () => {
    await acceptRepair("ver-1");
    const where = renderSql(acceptWhereCapture.value);
    // Stale-payload guard: only promote while a pending repair still exists.
    expect(where).toContain("repaired_files_json");
    expect(where).toContain("is not null");
    // Missing-table fail-safe: to_regclass(...) IS NULL keeps legacy accept working.
    expect(where).toContain("to_regclass");
    // No-active-lease guard remains.
    expect(where).toContain("not exists");
    expect(where).toContain("lease_expires_at");
  });
});

describe("renewVersionLease — refuses expired leases (Codex P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renewWhereCapture.value = undefined;
  });

  it("returns false and only matches an unexpired lease (lease_expires_at > now())", async () => {
    const ok = await renewVersionLease("ver-1", "run-1");
    expect(ok).toBe(false); // rowCount 0 -> ownership lost
    const where = renderSql(renewWhereCapture.value);
    expect(where).toContain("lease_expires_at");
    expect(where).toContain("now()");
    expect(where).toContain(">"); // strict greater-than = not-yet-expired
  });
});
