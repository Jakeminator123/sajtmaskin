import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// Codex P2 (round 3 + 4) regression evidence for acceptRepair + renewVersionLease.
//
// We mock the drizzle `db` so we can CAPTURE the exact SET object and WHERE SQL
// the production code builds, then render them with PgDialect and assert the
// predicates that close the findings:
//
//   - accept promotes the CURRENT pending repair (column ref) bound to the exact
//     payload SELECTed (`repaired_files_json = $`) — no stale resurrection AND no
//     promoting a *replacement* repair that hasn't reached its own timeout.
//   - accept never NAMES engine_version_jobs in the statement when the table is
//     absent (resolved out of band via leaseTableExists/to_regclass), because
//     Postgres resolves relations at parse time; only when present is the
//     NOT EXISTS lease guard added.
//   - renewVersionLease refuses an already-expired lease (lease_expires_at >
//     now()).

const transaction = vi.hoisted(() => vi.fn());
const execute = vi.hoisted(() => vi.fn());
const acceptSetCapture = vi.hoisted(() => ({ value: undefined as unknown }));
const acceptWhereCapture = vi.hoisted(() => ({ value: undefined as unknown }));
const updateWhereCapture = vi.hoisted(() => ({ value: undefined as unknown }));

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
    // leaseTableExists() probe: SELECT to_regclass('public.engine_version_jobs')
    execute,
    transaction: (cb: (t: typeof tx) => unknown) => {
      transaction();
      return cb(tx);
    },
    // renewVersionLease + failVersionVerificationIfUnleased both use
    // db.update(...).set(...).where(...); capture the last WHERE either built.
    update: () => ({
      set: () => ({
        where: (w: unknown) => {
          updateWhereCapture.value = w;
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
} from "./chat-repository-pg";

function renderSql(value: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PgDialect().sqlToQuery(value as any).sql.toLowerCase();
}

function mockLeaseTableExists(exists: boolean) {
  execute.mockResolvedValue({ rows: [{ oid: exists ? "16384" : null }] });
}

describe("acceptRepair — round 3+4 atomic promote, payload binding, missing-table fail-safe (Codex P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acceptSetCapture.value = undefined;
    acceptWhereCapture.value = undefined;
  });
  afterEach(() => vi.clearAllMocks());

  it("promotes the pending repair via a column reference (not a JS snapshot)", async () => {
    mockLeaseTableExists(true);
    await acceptRepair("ver-1");
    expect(transaction).toHaveBeenCalledTimes(1);

    const set = acceptSetCapture.value as Record<string, unknown>;
    expect(typeof set.filesJson).not.toBe("string");
    expect(renderSql(set.filesJson)).toContain("repaired_files_json");
  });

  it("binds the UPDATE to the exact selected payload AND enforces no-active-lease when the table exists", async () => {
    mockLeaseTableExists(true);
    await acceptRepair("ver-1");
    const where = renderSql(acceptWhereCapture.value);
    // Replacement-repair guard: equality to the selected payload, not IS NOT NULL.
    expect(where).toContain("repaired_files_json");
    expect(where).not.toContain("is not null");
    // No-active-lease guard present (table exists).
    expect(where).toContain("not exists");
    expect(where).toContain("engine_version_jobs");
    expect(where).toContain("lease_expires_at");
  });

  it("does NOT name engine_version_jobs in the statement when the table is absent (pre-migration fail-safe)", async () => {
    mockLeaseTableExists(false);
    await acceptRepair("ver-1");
    const where = renderSql(acceptWhereCapture.value);
    // The payload binding still applies...
    expect(where).toContain("repaired_files_json");
    // ...but the lease table is never referenced, so Postgres can't throw
    // "relation does not exist" on a pre-migration database.
    expect(where).not.toContain("engine_version_jobs");
    expect(where).not.toContain("to_regclass");
  });
});

describe("renewVersionLease — refuses expired leases (Codex P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateWhereCapture.value = undefined;
  });

  it("returns false and only matches an unexpired lease (lease_expires_at > now())", async () => {
    const ok = await renewVersionLease("ver-1", "run-1");
    expect(ok).toBe(false); // rowCount 0 -> ownership lost
    const where = renderSql(updateWhereCapture.value);
    expect(where).toContain("lease_expires_at");
    expect(where).toContain("now()");
    expect(where).toContain(">"); // strict greater-than = not-yet-expired
  });
});

describe("failVersionVerificationIfUnleased — lease-safe stuck-repair recovery (Bugbot)", () => {
  // Bugbot: a manual/server-verify repair that loses its lease leaves the row in
  // `repairing` because the lease-conditioned failVersionVerification no-ops.
  // The readiness watchdog now also targets `repairing` and recovers via this
  // primitive — which must NOT fail a version while an active lease still owns it
  // (a legit running repair), and must degrade safely before the jobs migration.
  beforeEach(() => {
    vi.clearAllMocks();
    updateWhereCapture.value = undefined;
  });

  it("only fails the version when NO active lease owns it (table exists)", async () => {
    mockLeaseTableExists(true);
    const res = await failVersionVerificationIfUnleased("ver-1", "stuck repair recovered");
    expect(res).toBeNull(); // rowCount 0 -> an active lease still owns it; left intact
    const where = renderSql(updateWhereCapture.value);
    expect(where).toContain("not exists");
    expect(where).toContain("engine_version_jobs");
    expect(where).toContain("lease_expires_at");
    expect(where).toContain("now()");
  });

  it("degrades to an unconditional watchdog (no lease table reference) pre-migration", async () => {
    mockLeaseTableExists(false);
    await failVersionVerificationIfUnleased("ver-1", "stuck repair recovered");
    const where = renderSql(updateWhereCapture.value);
    expect(where).not.toContain("engine_version_jobs");
    expect(where).not.toContain("to_regclass");
  });
});
