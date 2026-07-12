import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// P1 (files_json false-green-rest): `updateVersionFiles` is the CANONICAL
// files_json writer, so it must take the same version lease the verify flow
// holds — otherwise a user edit / normalize / validate / heal can advance the
// DB snapshot to B while ReleaseGate verified in-memory A and promotion (bound
// only to the verify runId) stamps `promoted`/`passed` on unverified content.
//
// We drive the drizzle update + select + execute chains to prove the guard is
// embedded ATOMICALLY in the UPDATE's WHERE (no separate check-then-write), and
// that a 0-row block is disambiguated (foreign lease → throw / missing row →
// false).

const updateSet = vi.hoisted(() => ({ value: undefined as unknown }));
const updateWhere = vi.hoisted(() => ({ value: undefined as unknown }));
const updateRowCount = vi.hoisted(() => ({ value: 0 }));
// leaseTableExists() → db.execute(to_regclass) — null oid means "table missing".
const regclassOid = vi.hoisted(() => ({ value: "12345" as string | null }));
// Row-existence probe after a 0-row guarded UPDATE → db.select(...).limit(1).
// Non-empty = the version row EXISTS, so the 0-row can only mean the lease
// blocked the write (exact classification, no lease re-probe race).
const probeRows = vi.hoisted(() => ({ value: [] as unknown[] }));
// getStoredVersion is not exercised (we assert on the boolean/throw), but keep
// the select chain alive for any incidental read.

vi.mock("@/lib/db/client", () => {
  const runUpdate = {
    set: (s: unknown) => {
      updateSet.value = s;
      return {
        where: (w: unknown) => {
          updateWhere.value = w;
          return Promise.resolve({ rowCount: updateRowCount.value });
        },
      };
    },
  };
  return {
    dbConfigured: true,
    db: {
      update: () => runUpdate,
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(probeRows.value),
          }),
        }),
      }),
      execute: () =>
        Promise.resolve({
          rows: regclassOid.value == null ? [{ oid: null }] : [{ oid: regclassOid.value }],
        }),
      transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          execute: () => Promise.resolve({ rows: [] }),
          update: () => runUpdate,
        }),
    },
  };
});
vi.mock("./promote-guard", () => ({
  assertPromoteAllowed: vi.fn(async () => ({ allowed: true, reason: null })),
}));

import { updateVersionFiles } from "./chat-repository-pg";
import { VersionLeaseHeldError } from "./version-lease-error";

const FILES = '[{"path":"app/page.tsx","content":"A"}]';

function renderWhere(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = new PgDialect().sqlToQuery(updateWhere.value as any);
  return q.sql.toLowerCase();
}

describe("updateVersionFiles — version-lease guard (P1 files_json false-green-rest)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSet.value = undefined;
    updateWhere.value = undefined;
    updateRowCount.value = 0;
    regclassOid.value = "12345"; // lease table exists by default
    probeRows.value = [];
  });

  it("(a) blocks a user edit while a FOREIGN lease is active — throws version_busy, WHERE guards on NOT EXISTS lease", async () => {
    // A foreign, unexpired lease owns the row → the NOT EXISTS predicate fails →
    // 0-row UPDATE. The post-write probe sees the active lease → typed throw.
    updateRowCount.value = 0;
    probeRows.value = [{ id: "job-1" }];

    await expect(updateVersionFiles("ver-1", FILES, { invalidateVerification: true })).rejects.toBeInstanceOf(
      VersionLeaseHeldError,
    );

    // The WHERE binds the write to "no active lease" — atomically, in the same
    // statement — so the files_json UPDATE can never match while a lease is held.
    const sql = renderWhere();
    expect(sql).toContain("not exists");
    expect(sql).toContain("engine_version_jobs");
    expect(sql).toContain("lease_expires_at");
    // The block path carries no run_id predicate (that is the holder exception).
    expect(sql).not.toContain("run_id");
  });

  it("(a') carries version_busy on the thrown error for the 409 translation", async () => {
    updateRowCount.value = 0;
    probeRows.value = [{ id: "job-1" }];
    const err = await updateVersionFiles("ver-1", FILES).catch((e) => e);
    expect(err).toBeInstanceOf(VersionLeaseHeldError);
    expect((err as VersionLeaseHeldError).code).toBe("version_busy");
    expect((err as VersionLeaseHeldError).versionId).toBe("ver-1");
  });

  it("returns false (NOT a lease throw) when the row is simply missing — so callers 404, not 409", async () => {
    updateRowCount.value = 0;
    probeRows.value = []; // no lease held → the 0-row is a missing row
    const ok = await updateVersionFiles("ver-1", FILES, { invalidateVerification: true });
    expect(ok).toBe(false);
  });

  it("(c) after the lease releases / expires the write succeeds again and invalidateVerification resets the verdict", async () => {
    // No active lease → the NOT EXISTS predicate matches → the UPDATE lands.
    updateRowCount.value = 1;
    const ok = await updateVersionFiles("ver-1", FILES, { invalidateVerification: true });
    expect(ok).toBe(true);

    const set = updateSet.value as Record<string, unknown>;
    expect(set.releaseState).toBe("draft");
    expect(set.verificationState).toBe("pending");
    expect(set.verificationSummary).toBeNull();
    expect(set.promotedAt).toBeNull();
    expect(set.previewUrl).toBeNull();
  });

  it("(d) lets the LEASE HOLDER's own write through (matching runId) — WHERE guards on EXISTS run_id", async () => {
    updateRowCount.value = 1;
    const ok = await updateVersionFiles("ver-1", FILES, { holderRunId: "run-1" });
    expect(ok).toBe(true);

    const sql = renderWhere();
    expect(sql).toContain("exists");
    expect(sql).not.toContain("not exists");
    expect(sql).toContain("run_id");
    expect(sql).toContain("engine_version_jobs");
  });

  it("best-effort heal path (lockTimeoutMs) fail-CLOSES under a foreign lease: no-op returns false, never throws", async () => {
    // The NOT EXISTS guard is also applied on the heal path, so a heal-persist
    // can't clobber a lease-protected snapshot; it just skips (returns false)
    // and the next uncontended read re-persists the idempotent heal.
    updateRowCount.value = 0;
    probeRows.value = [{ id: "job-1" }];
    const ok = await updateVersionFiles("ver-1", FILES, { lockTimeoutMs: 2000 });
    expect(ok).toBe(false);
    const sql = renderWhere();
    expect(sql).toContain("not exists");
    expect(sql).toContain("engine_version_jobs");
  });

  it("degrades to the legacy unconditional write before the lease table exists (pre-migration)", async () => {
    regclassOid.value = null; // leaseTableExists() → false
    updateRowCount.value = 1;
    const ok = await updateVersionFiles("ver-1", FILES, { invalidateVerification: true });
    expect(ok).toBe(true);
    const sql = renderWhere();
    // No reference to the (missing) lease table — Postgres would fail to plan it.
    expect(sql).not.toContain("engine_version_jobs");
  });
});
