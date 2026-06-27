import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// #260 round-2 (Codex P2 "clear stale repair state"): the readiness watchdog
// must only fail a `repairing` row when its lease was GENUINELY lost (a frozen
// holder = a still-`running` lease whose `lease_expires_at` is in the past), not
// when a stale-base repair cleanly released its lease after a concurrent user
// edit. `hasExpiredRunningVersionLease` is that probe. We mock the drizzle
// select chain to drive its branches + inspect the WHERE it builds.

const selectWhere = vi.hoisted(() => ({ value: undefined as unknown }));
const rows = vi.hoisted(() => ({ value: [] as unknown[] }));
const shouldThrow = vi.hoisted(() => ({ value: false }));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    select: () => ({
      from: () => ({
        where: (w: unknown) => {
          selectWhere.value = w;
          return {
            limit: () =>
              shouldThrow.value
                ? Promise.reject(new Error("relation \"engine_version_jobs\" does not exist"))
                : Promise.resolve(rows.value),
          };
        },
      }),
    }),
  },
}));
vi.mock("./promote-guard", () => ({
  assertPromoteAllowed: vi.fn(async () => ({ allowed: true, reason: null })),
}));

import { hasExpiredRunningVersionLease } from "./chat-repository-pg";

function renderQuery(value: unknown): { sql: string; params: unknown[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = new PgDialect().sqlToQuery(value as any);
  return { sql: q.sql.toLowerCase(), params: q.params };
}

describe("hasExpiredRunningVersionLease (#260 round-2 — watchdog liveness probe)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectWhere.value = undefined;
    rows.value = [];
    shouldThrow.value = false;
  });

  it("queries for a RUNNING lease whose lease_expires_at is already in the past", async () => {
    rows.value = [{ id: "job-1" }];
    const res = await hasExpiredRunningVersionLease("ver-1");
    expect(res).toBe(true);

    const { sql, params } = renderQuery(selectWhere.value);
    expect(sql).toContain("version_id");
    expect(sql).toContain("status");
    expect(sql).toContain("lease_expires_at");
    expect(sql).toContain("< now()");
    expect(params).toContain("running");
    expect(params).toContain("ver-1");
  });

  it("returns false when no expired running lease exists (clean release after stale_base)", async () => {
    rows.value = [];
    expect(await hasExpiredRunningVersionLease("ver-1")).toBe(false);
  });

  it("fail-safe: returns false on a DB error / missing lease table (pre-migration)", async () => {
    shouldThrow.value = true;
    expect(await hasExpiredRunningVersionLease("ver-1")).toBe(false);
  });
});
