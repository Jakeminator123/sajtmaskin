import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// Bugbot HIGH (PR #376): `updateChatOrchestrationSnapshot` persists a snapshot
// built from an EARLIER read of the column. If `recordKnownBrokenImageReplacements`
// appended a healed-image mapping between that read and this write, a plain
// column replace would silently drop the mapping. The fix merges the
// `knownBrokenImageReplacements` key SQL-side against the column's CURRENT
// value, so the interleaving `record → full snapshot-write` keeps the mapping.
// These tests render the generated SQL to prove the write reads the live
// column value instead of trusting the stale JS snapshot.

const updateSet = vi.hoisted(() => ({ value: undefined as unknown }));
const updateWhere = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    update: () => ({
      set: (s: unknown) => {
        updateSet.value = s;
        return {
          where: (w: unknown) => {
            updateWhere.value = w;
            return Promise.resolve({ rowCount: 1 });
          },
        };
      },
    }),
  },
}));
vi.mock("./promote-guard", () => ({
  assertPromoteAllowed: vi.fn(async () => ({ allowed: true, reason: null })),
}));

import { updateChatOrchestrationSnapshot } from "./chat-repository-pg";

function renderSetExpression(): { sql: string; params: unknown[] } {
  const set = updateSet.value as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = new PgDialect().sqlToQuery(set.orchestrationSnapshot as any);
  return { sql: q.sql.toLowerCase(), params: q.params };
}

describe("updateChatOrchestrationSnapshot — knownBrokenImageReplacements survives full snapshot writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSet.value = undefined;
    updateWhere.value = undefined;
  });

  it("merges the column's CURRENT knownBrokenImageReplacements into the incoming snapshot (record → snapshot-write keeps the mapping)", async () => {
    // Simulated interleaving: recordKnownBrokenImageReplacements already
    // appended to the DB column; this snapshot (from an earlier read) does NOT
    // carry the mapping. The generated SQL must union the live column value.
    const staleSnapshot = { scaffoldId: "landing-page", lastVersionId: "ver_2" };

    const ok = await updateChatOrchestrationSnapshot("chat_1", staleSnapshot);
    expect(ok).toBe(true);

    const { sql, params } = renderSetExpression();
    // The write must read the column's live value for the key…
    expect(sql).toContain("orchestration_snapshot");
    expect(sql).toContain("jsonb_set");
    // …union it with the incoming snapshot's key (`||` between two coalesce
    // branches referencing the key parameter)…
    expect(sql).toContain("||");
    expect(params).toContain("knownBrokenImageReplacements");
    // …and the incoming snapshot rides along as a bound parameter.
    expect(params).toContain(JSON.stringify(staleSnapshot));
  });

  it("still supports clearing the snapshot with null (plain replace, no merge)", async () => {
    const ok = await updateChatOrchestrationSnapshot("chat_1", null);
    expect(ok).toBe(true);
    const set = updateSet.value as Record<string, unknown>;
    expect(set.orchestrationSnapshot).toBeNull();
  });
});
