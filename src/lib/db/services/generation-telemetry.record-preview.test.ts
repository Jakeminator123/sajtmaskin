import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// M#pv1 (honest preview_success): recordPreviewRuntimeOutcomeForVersion stamps
// the CONFIRMED preview runtime outcome onto the version's latest telemetry
// row. Codex P2 (PR #377 round 2): the monotonicity must live INSIDE the single
// UPDATE statement (no read-check-write window):
//   - true-stamp:  WHERE … AND preview_success IS DISTINCT FROM true
//   - false-stamp: WHERE … AND preview_success IS NULL
// and the target row (latest for the version) is resolved by a subquery in the
// same statement. These tests render the generated SQL to prove the guards —
// same pattern as chat-repository-pg.snapshot-merge.test.ts.

const updateSet = vi.hoisted(() => ({ value: undefined as unknown }));
const updateWhere = vi.hoisted(() => ({ value: undefined as unknown }));
const updateCalls = vi.hoisted(() => ({ count: 0 }));
const updateResult = vi.hoisted(() => ({ rowCount: 1, reject: false }));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    update: () => ({
      set: (s: unknown) => {
        updateSet.value = s;
        return {
          where: (w: unknown) => {
            updateWhere.value = w;
            updateCalls.count += 1;
            if (updateResult.reject) {
              return Promise.reject(new Error("db down"));
            }
            return Promise.resolve({ rowCount: updateResult.rowCount });
          },
        };
      },
    }),
  },
}));

const { recordPreviewRuntimeOutcomeForVersion, resetConfirmedPreviewReadyCacheForTests } =
  await import("./generation-telemetry");

function renderWhere(): { sql: string; params: unknown[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = new PgDialect().sqlToQuery(updateWhere.value as any);
  return { sql: q.sql.toLowerCase(), params: q.params };
}

describe("recordPreviewRuntimeOutcomeForVersion (M#pv1, atomic SQL-side monotonicity)", () => {
  beforeEach(() => {
    updateSet.value = undefined;
    updateWhere.value = undefined;
    updateCalls.count = 0;
    updateResult.rowCount = 1;
    updateResult.reject = false;
    resetConfirmedPreviewReadyCacheForTests();
    vi.clearAllMocks();
  });

  it("true-stamp: single conditional UPDATE with IS DISTINCT FROM true (null→true and false→true allowed, true terminal)", async () => {
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);

    expect(updateCalls.count).toBe(1);
    expect(updateSet.value).toEqual({ previewSuccess: true });
    const { sql, params } = renderWhere();
    // Monotonic guard lives in the statement itself…
    expect(sql).toContain("is distinct from true");
    // …and the latest-row-for-version target is a subquery in the SAME
    // statement (no pre-read).
    expect(sql).toContain("select");
    expect(sql).toContain("order by");
    expect(sql).toContain("limit 1");
    expect(params).toContain("ver_1");
  });

  it("false-stamp: guard is IS NULL — a delayed false can never overwrite a confirmed true (only null→false allowed)", async () => {
    await recordPreviewRuntimeOutcomeForVersion("ver_1", false);

    expect(updateCalls.count).toBe(1);
    expect(updateSet.value).toEqual({ previewSuccess: false });
    const { sql, params } = renderWhere();
    expect(sql).toContain("is null");
    expect(sql).not.toContain("is distinct from");
    expect(sql).toContain("limit 1");
    expect(params).toContain("ver_1");
  });

  it("caches a MATCHED true-stamp per instance — repeat polls do no DB round-trip at all", async () => {
    updateResult.rowCount = 1;
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(1);

    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    await recordPreviewRuntimeOutcomeForVersion("ver_1", false);
    expect(updateCalls.count).toBe(1);

    // Other versions are unaffected by the cache.
    await recordPreviewRuntimeOutcomeForVersion("ver_2", true);
    expect(updateCalls.count).toBe(2);
  });

  it("does NOT cache when the true-stamp matched nothing (no row yet, or stamped elsewhere) — a later stamp still reaches the DB", async () => {
    updateResult.rowCount = 0;
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(1);

    // A telemetry row may appear later (finalize) — the next receipt must
    // still issue the conditional UPDATE.
    updateResult.rowCount = 1;
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(2);
  });

  it("does NOT cache false-stamps — a later confirmed boot can still upgrade false→true", async () => {
    updateResult.rowCount = 1;
    await recordPreviewRuntimeOutcomeForVersion("ver_1", false);
    expect(updateCalls.count).toBe(1);

    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCalls.count).toBe(2);
    expect(updateSet.value).toEqual({ previewSuccess: true });
  });

  it("no-ops for an empty versionId (best-effort)", async () => {
    await recordPreviewRuntimeOutcomeForVersion("", true);
    expect(updateCalls.count).toBe(0);
  });

  it("never throws when the UPDATE fails (best-effort hot path)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    updateResult.reject = true;

    await expect(
      recordPreviewRuntimeOutcomeForVersion("ver_err", true),
    ).resolves.toBeUndefined();

    expect(updateCalls.count).toBe(1);
    expect(warn).toHaveBeenCalled();
    // A failed stamp must NOT poison the cache — the next receipt retries.
    updateResult.reject = false;
    await recordPreviewRuntimeOutcomeForVersion("ver_err", true);
    expect(updateCalls.count).toBe(2);
    warn.mockRestore();
  });
});
