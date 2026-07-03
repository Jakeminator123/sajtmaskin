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

import {
  recordKnownBrokenImageReplacements,
  updateChatOrchestrationSnapshot,
} from "./chat-repository-pg";
import { KNOWN_IMAGE_REPLACEMENTS_DB_HARD_CEILING } from "@/lib/utils/image-validator";

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

// Codex P2 (PR #376 round 2): the append union alone lets the jsonb COLUMN
// creep past the read cap (51, 52, …). The write must carry a SQL-side hard
// ceiling: when the merged map exceeds the ceiling, the key is RESET to just
// the incoming (already capped) batch inside the same UPDATE.
describe("recordKnownBrokenImageReplacements — SQL-side hard ceiling on the merged map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSet.value = undefined;
    updateWhere.value = undefined;
  });

  it("renders a CASE that counts merged keys against the hard ceiling and falls back to the incoming batch", async () => {
    const incoming = {
      "https://images.unsplash.com/photo-dead?w=800":
        "https://images.unsplash.com/photo-live?w=800",
    };

    const ok = await recordKnownBrokenImageReplacements("chat_1", incoming);
    expect(ok).toBe(true);

    const { sql, params } = renderSetExpression();
    // Ceiling guard: merged key count is measured in SQL…
    expect(sql).toContain("case");
    expect(sql).toContain("jsonb_object_keys");
    expect(sql).toContain("count(*)");
    // …compared against the hard ceiling (2× read cap)…
    expect(params).toContain(KNOWN_IMAGE_REPLACEMENTS_DB_HARD_CEILING);
    // …and both the union branch and the reset-to-incoming branch bind the
    // (already capped) incoming batch as a parameter.
    expect(sql).toContain("||");
    expect(params).toContain(JSON.stringify(incoming));
  });

  it("no-ops without touching the DB when the incoming batch is empty after coercion", async () => {
    const ok = await recordKnownBrokenImageReplacements("chat_1", {
      "not-a-url": "also-not-a-url",
    });
    expect(ok).toBe(false);
    expect(updateSet.value).toBeUndefined();
  });
});
