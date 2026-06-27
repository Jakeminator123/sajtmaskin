import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// Codex P2 regression evidence for the distributed-lease mutations.
//
// We mock the drizzle `db`/transaction so we can CAPTURE the exact SET object,
// WHERE SQL, and raw tx.execute() statements the production code builds, render
// them with PgDialect, and assert the predicates that close the findings:
//
//   - acceptRepair promotes the CURRENT pending repair (column ref) bound to the
//     exact payload SELECTed (`repaired_files_json = $`) — no stale resurrection,
//     no promoting a *replacement* repair — and never NAMES engine_version_jobs
//     when the table is absent (resolved out of band via leaseTableExists).
//   - acceptRepair + failVersionVerificationIfUnleased LOCK the version row
//     (FOR UPDATE) before the no-active-lease UPDATE, and acquireVersionLease
//     locks the same row before inserting its lease — so the two paths serialize
//     and the promote/fail-then-lease race is closed.
//   - renewVersionLease refuses an already-expired lease (lease_expires_at > now).

const execute = vi.hoisted(() => vi.fn()); // db.execute -> leaseTableExists probe
const transaction = vi.hoisted(() => vi.fn());
const dbUpdateWhere = vi.hoisted(() => ({ value: undefined as unknown }));
const txExecSqls = vi.hoisted(() => ({ value: [] as unknown[] }));
const txUpdateSet = vi.hoisted(() => ({ value: undefined as unknown }));
const txUpdateWhere = vi.hoisted(() => ({ value: undefined as unknown }));
const acceptSelectForUpdate = vi.hoisted(() => ({ value: false }));
const acquireWins = vi.hoisted(() => ({ value: true }));

function renderSql(value: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PgDialect().sqlToQuery(value as any).sql.toLowerCase();
}

const tx = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => {
          const rows = [{ repairedFilesJson: '{"src/app/page.tsx":"x"}' }];
          const p = Promise.resolve(rows) as Promise<typeof rows> & {
            for?: (mode: string) => Promise<typeof rows>;
          };
          // acceptRepair locks the version row with .for("update").
          p.for = () => {
            acceptSelectForUpdate.value = true;
            return Promise.resolve(rows);
          };
          return p;
        },
      }),
    }),
  }),
  update: () => ({
    set: (s: unknown) => {
      txUpdateSet.value = s;
      return {
        where: (w: unknown) => {
          txUpdateWhere.value = w;
          return Promise.resolve({ rowCount: 0 });
        },
      };
    },
  }),
  execute: (sqlObj: unknown) => {
    txExecSqls.value.push(sqlObj);
    const rendered = renderSql(sqlObj);
    if (rendered.includes("insert into engine_version_jobs")) {
      return Promise.resolve({ rows: acquireWins.value ? [{ run_id: "run-x" }] : [] });
    }
    // FOR UPDATE row lock (or any other probe).
    return Promise.resolve({ rows: [{}] });
  },
};

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    execute,
    transaction: (cb: (t: typeof tx) => unknown) => {
      transaction();
      return cb(tx);
    },
    // renewVersionLease uses db.update(...).set(...).where(...)
    update: () => ({
      set: () => ({
        where: (w: unknown) => {
          dbUpdateWhere.value = w;
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

import {
  acceptRepair,
  renewVersionLease,
  failVersionVerificationIfUnleased,
  acquireVersionLease,
} from "./chat-repository-pg";

function mockLeaseTableExists(exists: boolean) {
  execute.mockResolvedValue({ rows: [{ oid: exists ? "16384" : null }] });
}

function resetCaptures() {
  vi.clearAllMocks();
  dbUpdateWhere.value = undefined;
  txExecSqls.value = [];
  txUpdateSet.value = undefined;
  txUpdateWhere.value = undefined;
  acceptSelectForUpdate.value = false;
  acquireWins.value = true;
}

describe("acceptRepair — atomic promote, payload binding, missing-table + row-lock (Codex P2)", () => {
  beforeEach(resetCaptures);

  it("promotes the pending repair via a column reference (not a JS snapshot)", async () => {
    mockLeaseTableExists(true);
    await acceptRepair("ver-1");
    expect(transaction).toHaveBeenCalledTimes(1);
    const set = txUpdateSet.value as Record<string, unknown>;
    expect(typeof set.filesJson).not.toBe("string");
    expect(renderSql(set.filesJson)).toContain("repaired_files_json");
  });

  it("locks the version row (FOR UPDATE) before the conditional promote", async () => {
    mockLeaseTableExists(true);
    await acceptRepair("ver-1");
    expect(acceptSelectForUpdate.value).toBe(true);
  });

  it("binds the UPDATE to the exact selected payload AND enforces no-active-lease when the table exists", async () => {
    mockLeaseTableExists(true);
    await acceptRepair("ver-1");
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("repaired_files_json");
    expect(where).not.toContain("is not null");
    expect(where).toContain("not exists");
    expect(where).toContain("engine_version_jobs");
    expect(where).toContain("lease_expires_at");
  });

  it("does NOT name engine_version_jobs in the statement when the table is absent (pre-migration fail-safe)", async () => {
    mockLeaseTableExists(false);
    await acceptRepair("ver-1");
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("repaired_files_json");
    expect(where).not.toContain("engine_version_jobs");
    expect(where).not.toContain("to_regclass");
  });
});

describe("renewVersionLease — refuses expired leases (Codex P2)", () => {
  beforeEach(resetCaptures);

  it("returns false and only matches an unexpired lease (lease_expires_at > now())", async () => {
    const ok = await renewVersionLease("ver-1", "run-1");
    expect(ok).toBe(false); // rowCount 0 -> ownership lost
    const where = renderSql(dbUpdateWhere.value);
    expect(where).toContain("lease_expires_at");
    expect(where).toContain("now()");
    expect(where).toContain(">"); // strict greater-than = not-yet-expired
  });
});

describe("failVersionVerificationIfUnleased — lease-safe stuck-repair recovery (Bugbot + Codex P2)", () => {
  // Bugbot: a manual/server-verify repair that loses its lease leaves the row in
  // `repairing` because the lease-conditioned failVersionVerification no-ops. The
  // readiness watchdog now targets `repairing` and recovers via this primitive,
  // which must (a) only fail when NO active lease owns the row, (b) serialize
  // with acquireVersionLease via a FOR UPDATE row lock, and (c) degrade safely
  // before the jobs migration.
  beforeEach(resetCaptures);

  it("locks the version row (FOR UPDATE) and enforces no-active-lease when the table exists", async () => {
    mockLeaseTableExists(true);
    const res = await failVersionVerificationIfUnleased("ver-1", "stuck repair recovered");
    expect(res).toBeNull(); // rowCount 0 -> an active lease still owns it; left intact
    // Row lock taken before the conditional UPDATE.
    const lockStmts = txExecSqls.value.map((s) => renderSql(s));
    expect(lockStmts.some((s) => s.includes("for update") && s.includes("engine_versions"))).toBe(
      true,
    );
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("not exists");
    expect(where).toContain("engine_version_jobs");
    expect(where).toContain("lease_expires_at");
    expect(where).toContain("now()");
  });

  it("degrades to an unconditional watchdog (no lease table reference) pre-migration", async () => {
    mockLeaseTableExists(false);
    await failVersionVerificationIfUnleased("ver-1", "stuck repair recovered");
    const where = renderSql(txUpdateWhere.value);
    expect(where).not.toContain("engine_version_jobs");
    expect(where).not.toContain("to_regclass");
    // Still serializes via the row lock even pre-migration.
    const lockStmts = txExecSqls.value.map((s) => renderSql(s));
    expect(lockStmts.some((s) => s.includes("for update"))).toBe(true);
  });
});

describe("acquireVersionLease — serializes with version-row mutations (Codex P2)", () => {
  beforeEach(resetCaptures);

  it("locks the version row (FOR UPDATE) BEFORE inserting the lease", async () => {
    acquireWins.value = true;
    const res = await acquireVersionLease("ver-1", "server_verify");
    expect(res?.runId).toBeTruthy();
    const rendered = txExecSqls.value.map((s) => renderSql(s));
    const lockIdx = rendered.findIndex(
      (s) => s.includes("for update") && s.includes("engine_versions"),
    );
    const insertIdx = rendered.findIndex((s) => s.includes("insert into engine_version_jobs"));
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(lockIdx).toBeLessThan(insertIdx); // lock first, then insert
  });

  it("returns null when another live lease already owns the version", async () => {
    acquireWins.value = false;
    const res = await acquireVersionLease("ver-1", "manual_repair");
    expect(res).toBeNull();
  });
});
