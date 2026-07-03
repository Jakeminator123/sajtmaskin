import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// Bugbot MEDIUM (PR #382): the follow-up route reads the pending
// F3-continuation marker from a request-start snapshot — two rapid replies
// would both see it pending and both inherit F3. `consumeF3ContinuationMarker`
// is the atomic arbiter: a CONDITIONAL jsonb UPDATE that only reports a row
// while the message still contains an UNCONSUMED marker. These tests render
// the generated SQL to prove (a) the WHERE carries both containment
// conditions (marker present, consumed flag absent) and (b) the SET flags the
// marker element in place — plus that an unconfirmed write (rowCount 0)
// reports `false` to the caller.

const updateSet = vi.hoisted(() => ({ value: undefined as unknown }));
const updateWhere = vi.hoisted(() => ({ value: undefined as unknown }));
const updateRowCount = vi.hoisted(() => ({ value: 1 }));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    update: () => ({
      set: (s: unknown) => {
        updateSet.value = s;
        return {
          where: (w: unknown) => {
            updateWhere.value = w;
            return Promise.resolve({ rowCount: updateRowCount.value });
          },
        };
      },
    }),
  },
}));
vi.mock("./promote-guard", () => ({
  assertPromoteAllowed: vi.fn(async () => ({ allowed: true, reason: null })),
}));

import { consumeF3ContinuationMarker } from "./chat-repository-pg";

function renderSql(value: unknown): { sql: string; params: unknown[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = new PgDialect().sqlToQuery(value as any);
  return { sql: q.sql.toLowerCase(), params: q.params };
}

describe("consumeF3ContinuationMarker — conditional jsonb consume is the race arbiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSet.value = undefined;
    updateWhere.value = undefined;
    updateRowCount.value = 1;
  });

  it("only consumes while the row still holds an UNCONSUMED marker (conditional WHERE)", async () => {
    const ok = await consumeF3ContinuationMarker("chat_1", "msg_marker");
    expect(ok).toBe(true);

    const { sql, params } = renderSql(updateWhere.value);
    // Row addressing…
    expect(params).toContain("msg_marker");
    expect(params).toContain("chat_1");
    // …containment: the marker must be present…
    expect(sql).toContain("@>");
    expect(params).toContain(JSON.stringify([{ output: { f3Continuation: true } }]));
    // …and NOT already consumed (this is what makes the write the arbiter:
    // the racing second UPDATE re-evaluates the WHERE against the committed
    // row, sees the flag and reports 0 rows).
    expect(sql).toContain("not");
    expect(params).toContain(
      JSON.stringify([{ output: { f3ContinuationConsumed: true } }]),
    );
  });

  it("flags the marker element in place via jsonb_set over jsonb_array_elements", async () => {
    await consumeF3ContinuationMarker("chat_1", "msg_marker");

    const set = updateSet.value as Record<string, unknown>;
    const { sql } = renderSql(set.uiParts);
    expect(sql).toContain("jsonb_array_elements");
    expect(sql).toContain("jsonb_agg");
    expect(sql).toContain("jsonb_set");
    expect(sql).toContain("f3continuationconsumed");
    // Non-marker parts ride along untouched (CASE … ELSE part).
    expect(sql).toContain("case");
    expect(sql).toContain("else part");
  });

  it("reports false when the conditional write matches no row (already consumed / missing)", async () => {
    updateRowCount.value = 0;
    const ok = await consumeF3ContinuationMarker("chat_1", "msg_marker");
    expect(ok).toBe(false);
  });
});
