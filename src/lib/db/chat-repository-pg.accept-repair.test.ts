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
const dbUpdateSet = vi.hoisted(() => ({ value: undefined as unknown }));
const dbUpdateWhere = vi.hoisted(() => ({ value: undefined as unknown }));
const dbUpdateRowCount = vi.hoisted(() => ({ value: 0 }));
const dbUpdateFailure = vi.hoisted(() => ({ value: null as Error | null }));
const txExecSqls = vi.hoisted(() => ({ value: [] as unknown[] }));
const txUpdateSet = vi.hoisted(() => ({ value: undefined as unknown }));
const txUpdateWhere = vi.hoisted(() => ({ value: undefined as unknown }));
const acceptSelectForUpdate = vi.hoisted(() => ({ value: false }));
const acquireWins = vi.hoisted(() => ({ value: true }));
const txExecuteFailure = vi.hoisted(() => ({
  match: "" as string,
  error: null as Error | null,
}));
const txUpdateFailure = vi.hoisted(() => ({ value: null as Error | null }));
const txUpdateRowCount = vi.hoisted(() => ({ value: 0 }));
const dbSelectRows = vi.hoisted(() => ({ value: [] as Array<Record<string, unknown>> }));
const dbSelectSequence = vi.hoisted(() => ({
  value: [] as Array<Array<Record<string, unknown>>>,
}));
const lockSnapSequence = vi.hoisted(() => ({ value: [] as Array<Record<string, unknown>> }));
const acceptSelectFailure = vi.hoisted(() => ({ value: null as Error | null }));
// The row acceptRepair SELECTs FOR UPDATE: { repairedFilesJson, filesJson }.
const selectRows = vi.hoisted(() => ({ value: [] as Array<Record<string, unknown>> }));
// Snapshot returned by fail/promote `SELECT … FOR UPDATE` (L5 CAS classify).
const lockSnap = vi.hoisted(() => ({
  value: {
    verification_state: "verifying",
    files_revision: null,
    files_json: '[{"path":"app/page.tsx","content":"A"}]',
    orchestration_snapshot: null,
    edit_kind: null,
  } as Record<string, unknown>,
}));

function renderSql(value: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PgDialect().sqlToQuery(value as any).sql.toLowerCase();
}

function renderParams(value: unknown): unknown[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PgDialect().sqlToQuery(value as any).params;
}

const tx = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => {
          const rows = selectRows.value;
          const p = Promise.resolve(rows) as Promise<typeof rows> & {
            for?: (mode: string) => Promise<typeof rows>;
          };
          // acceptRepair locks the version row with .for("update").
          p.for = () => {
            acceptSelectForUpdate.value = true;
            if (acceptSelectFailure.value) return Promise.reject(acceptSelectFailure.value);
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
          if (txUpdateFailure.value) return Promise.reject(txUpdateFailure.value);
          return Promise.resolve({ rowCount: txUpdateRowCount.value });
        },
      };
    },
  }),
  execute: (sqlObj: unknown) => {
    txExecSqls.value.push(sqlObj);
    const rendered = renderSql(sqlObj);
    if (txExecuteFailure.error && rendered.includes(txExecuteFailure.match)) {
      return Promise.reject(txExecuteFailure.error);
    }
    if (rendered.includes("insert into engine_version_jobs")) {
      return Promise.resolve({ rows: acquireWins.value ? [{ run_id: "run-x" }] : [] });
    }
    // FOR UPDATE row lock (or any other probe). L5 reads CAS columns here.
    if (rendered.includes("for update") && rendered.includes("engine_versions")) {
      return Promise.resolve({ rows: [lockSnapSequence.value.shift() ?? lockSnap.value] });
    }
    return Promise.resolve({ rows: [{}] });
  },
};

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    execute,
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(dbSelectSequence.value.shift() ?? dbSelectRows.value),
        }),
      }),
    }),
    transaction: (cb: (t: typeof tx) => unknown) => {
      transaction();
      return cb(tx);
    },
    // renewVersionLease uses db.update(...).set(...).where(...)
    update: () => ({
      set: (s: unknown) => {
        dbUpdateSet.value = s;
        return {
        where: (w: unknown) => {
          dbUpdateWhere.value = w;
          if (dbUpdateFailure.value) return Promise.reject(dbUpdateFailure.value);
          return Promise.resolve({ rowCount: dbUpdateRowCount.value });
        },
        };
      },
    }),
  },
}));

// Keep the false-green promote guard out of the way: it has its own test suite.
vi.mock("./promote-guard", () => ({
  assertPromoteAllowed: vi.fn(async () => ({ allowed: true, reason: null })),
  scopePromotionSnapshotForVersion: (snapshot: unknown, editKind: unknown) =>
    editKind === "restore" ? null : snapshot,
  normalizeContractIntegrationsToken: (snapshot: unknown) =>
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? ((snapshot as Record<string, unknown>).contractIntegrations ?? null)
      : null,
}));

import {
  acceptRepair,
  renewVersionLease,
  failVersionVerificationIfUnleased,
  promoteVersion,
  promoteVersionIfUnleased,
  maybeAutoAcceptTimedOutRepair,
  acquireVersionLease,
} from "./chat-repository-pg";
import {
  holdVersionForIntegrationMigration,
  resetVersionVerificationToPending,
} from "./chat-repository/version-lifecycle";
import { assertPromoteAllowed } from "./promote-guard";
import { encodeRepairedFilesEnvelope } from "./repair-files-payload";

const BASE_A = '[{"path":"app/page.tsx","content":"A"}]';
const REPAIRED_JSON = '[{"path":"app/page.tsx","content":"A-fixed"}]';

/** A pending-repair row whose envelope base-hash matches `filesJson`. */
function envelopeRow(filesJson: string) {
  return {
    repairedFilesJson: encodeRepairedFilesEnvelope({
      repairedFilesJson: REPAIRED_JSON,
      baseFilesJson: filesJson,
    }),
    filesJson,
    editKind: null,
    verificationState: "repair_available",
    filesRevision: "rev-a",
    orchestrationSnapshot: null,
  };
}

function mockLeaseTableExists(exists: boolean) {
  execute.mockResolvedValue({ rows: [{ oid: exists ? "16384" : null }] });
}

function mockLeaseTableUnavailable() {
  execute.mockRejectedValue(new Error("connection reset"));
}

function resetCaptures() {
  vi.clearAllMocks();
  dbUpdateWhere.value = undefined;
  txExecSqls.value = [];
  txUpdateSet.value = undefined;
  txUpdateWhere.value = undefined;
  acceptSelectForUpdate.value = false;
  acquireWins.value = true;
  txExecuteFailure.match = "";
  txExecuteFailure.error = null;
  txUpdateFailure.value = null;
  txUpdateRowCount.value = 0;
  dbUpdateSet.value = undefined;
  dbUpdateRowCount.value = 0;
  dbUpdateFailure.value = null;
  dbSelectRows.value = [];
  dbSelectSequence.value = [];
  lockSnapSequence.value = [];
  acceptSelectFailure.value = null;
  // Default: a base-matching envelope so the promote path runs.
  selectRows.value = [envelopeRow(BASE_A)];
  lockSnap.value = {
    verification_state: "verifying",
    files_revision: null,
    files_json: BASE_A,
    orchestration_snapshot: null,
    edit_kind: null,
  };
}

describe("resetVersionVerificationToPending — guarded settlement", () => {
  beforeEach(resetCaptures);

  const expected = {
    filesJson: BASE_A,
    filesRevision: "rev-a",
    editKind: null,
    verificationState: "repairing" as const,
    releaseState: "draft" as const,
    verificationSummary: "Repairing current provider context.",
  };

  it("preserves the pending repair envelope and binds every observed field", async () => {
    dbUpdateRowCount.value = 1;
    dbSelectRows.value = [{ id: "ver-1" }];

    await resetVersionVerificationToPending(
      "ver-1",
      "Provider decision context changed; retry verification.",
      "run-x",
      { expected, preserveRepairPayload: true },
    );

    expect(dbUpdateSet.value).toEqual(expect.objectContaining({
      releaseState: "draft",
      verificationState: "pending",
      verificationSummary: "Provider decision context changed; retry verification.",
    }));
    const set = dbUpdateSet.value as Record<string, unknown>;
    expect(set.repairedFilesJson).toBeUndefined();
    expect(set.repairAvailableAt).toBeUndefined();
    const where = renderSql(dbUpdateWhere.value);
    expect(where).toContain("files_json");
    expect(where).toContain("files_revision");
    expect(where).toContain("edit_kind");
    expect(where).toContain("verification_state");
    expect(where).toContain("release_state");
    expect(where).toContain("verification_summary");
    expect(where).toContain("engine_version_jobs");
  });

  it("keeps the legacy reset contract clearing repair payload by default", async () => {
    await resetVersionVerificationToPending("ver-1", "retry", "run-x");

    expect(dbUpdateSet.value).toEqual(expect.objectContaining({
      repairedFilesJson: null,
      repairAvailableAt: null,
    }));
  });

  it("returns null on a guarded CAS or lease miss without claiming success", async () => {
    dbUpdateRowCount.value = 0;
    await expect(
      resetVersionVerificationToPending("ver-1", "retry", "run-x", {
        expected,
        preserveRepairPayload: true,
      }),
    ).resolves.toBeNull();
  });

  it("does not mask guarded reset write errors", async () => {
    dbUpdateFailure.value = new Error("permission denied");
    await expect(
      resetVersionVerificationToPending("ver-1", "retry", "run-x", {
        expected,
        preserveRepairPayload: true,
      }),
    ).rejects.toThrow("permission denied");
  });
});

function pgError(code: string): Error & { code: string } {
  return Object.assign(new Error(`postgres ${code}`), { code });
}

describe("acceptRepair — envelope base-hash guard, atomic promote, missing-table + row-lock (Codex P2 + #260 #5)", () => {
  beforeEach(resetCaptures);

  it("promotes the files extracted from a base-matching envelope (bound string, not a column ref)", async () => {
    mockLeaseTableExists(true);
    await acceptRepair("ver-1");
    expect(transaction).toHaveBeenCalledTimes(1);
    const set = txUpdateSet.value as Record<string, unknown>;
    // The promote now writes the envelope's files (verified against the base),
    // not a `repaired_files_json` column reference.
    expect(typeof set.filesJson).toBe("string");
    expect(set.filesJson).toBe(REPAIRED_JSON);
  });

  it("locks the version row (FOR UPDATE) before the conditional promote", async () => {
    mockLeaseTableExists(true);
    await acceptRepair("ver-1");
    expect(acceptSelectForUpdate.value).toBe(true);
  });

  it("returns retryable null on a transient locked-context read failure", async () => {
    mockLeaseTableExists(true);
    acceptSelectFailure.value = pgError("40001");
    await expect(acceptRepair("ver-1")).resolves.toBeNull();
    expect(txUpdateSet.value).toBeUndefined();
  });

  it("returns retryable null on the bounded accept lock timeout", async () => {
    mockLeaseTableExists(true);
    acceptSelectFailure.value = pgError("55P03");
    await expect(acceptRepair("ver-1")).resolves.toBeNull();
    expect(txUpdateSet.value).toBeUndefined();
  });

  it("does not hide a non-transient locked-context read failure", async () => {
    mockLeaseTableExists(true);
    acceptSelectFailure.value = pgError("42501");
    await expect(acceptRepair("ver-1")).rejects.toMatchObject({ code: "42501" });
  });

  it("does not hide a transient UPDATE failure", async () => {
    mockLeaseTableExists(true);
    txUpdateFailure.value = pgError("40001");
    await expect(acceptRepair("ver-1")).rejects.toMatchObject({ code: "40001" });
  });

  /**
   * Innehållsrevision steg 3: guarden jämför verdiktets revision mot innehållet
   * som promotas. Här är det den reparerade payloaden — versionens `files_json`
   * håller fortfarande basen tills UPDATE:n i samma transaktion kör. Utan
   * `promotedFilesJson` skulle repair-passets verdikt (stämplat med den
   * reparerade revisionen av `saveRepairedFiles`) läsas som stale och kila fast
   * varje legitim accept.
   */
  it("skickar det promotbara innehållet till promote-guarden, inte versionens bas", async () => {
    mockLeaseTableExists(true);
    await acceptRepair("ver-1");
    expect(assertPromoteAllowed).toHaveBeenCalledWith(
      "ver-1",
      undefined,
      expect.objectContaining({
        onReadError: "indeterminate",
        promotedFilesJson: REPAIRED_JSON,
      }),
    );
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
    expect(where).toContain("files_json");
    expect(where).toContain("engine_chats");
    expect(where).toContain("orchestration_snapshot");
    expect(where).toContain("edit_kind");
  });

  it("passes locked base, candidate and version-bound snapshot to the migration guard", async () => {
    mockLeaseTableExists(true);
    selectRows.value = [{ ...envelopeRow(BASE_A), orchestrationSnapshot: { contractIntegrations: [] } }];
    await acceptRepair("ver-1");
    expect(assertPromoteAllowed).toHaveBeenCalledWith(
      "ver-1",
      undefined,
      expect.objectContaining({
        migrationContext: {
          currentFilesJson: BASE_A,
          candidateFilesJson: REPAIRED_JSON,
          orchestrationSnapshot: { contractIntegrations: [] },
        },
      }),
    );
  });

  it("CAS-binds the complete removal snapshot, including both tombstone fields", async () => {
    mockLeaseTableExists(true);
    const snapshot = {
      contractIntegrations: [],
      removedCapabilities: ["payments"],
      removedDossierIds: ["stripe-checkout"],
    };
    selectRows.value = [
      { ...envelopeRow(BASE_A), orchestrationSnapshot: snapshot },
    ];
    await acceptRepair("ver-1");

    const params = renderParams(txUpdateWhere.value).map((value) => String(value));
    expect(params).toContain(JSON.stringify(snapshot));
  });

  it("persists a typed migration denial while leaving the pending repair payload untouched", async () => {
    mockLeaseTableExists(true);
    vi.mocked(assertPromoteAllowed).mockResolvedValueOnce({
      allowed: false,
      indeterminate: true,
      code: "integration_migration_required",
      reason: "integration migration requires review before promotion",
    } as never);

    txUpdateRowCount.value = 1;
    await expect(acceptRepair("ver-1")).resolves.toBe(
      "integration_migration_required",
    );
    expect(txUpdateSet.value).toMatchObject({
      releaseState: "draft",
      verificationState: "pending",
      promotedAt: null,
    });
    expect(txUpdateSet.value).not.toHaveProperty("repairedFilesJson");
    expect(txUpdateSet.value).not.toHaveProperty("repairAvailableAt");
    expect(renderSql(txUpdateWhere.value)).toContain("repaired_files_json");
  });

  it("scopes a restore away from the latest chat contracts and binds edit_kind", async () => {
    mockLeaseTableExists(true);
    selectRows.value = [
      {
        ...envelopeRow(BASE_A),
        editKind: "restore",
        orchestrationSnapshot: { contractIntegrations: [{ providerKey: "auth0" }] },
      },
    ];
    await acceptRepair("ver-1");
    expect(assertPromoteAllowed).toHaveBeenCalledWith(
      "ver-1",
      undefined,
      expect.objectContaining({
        migrationContext: expect.objectContaining({ orchestrationSnapshot: null }),
      }),
    );
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("edit_kind");
    expect(where).not.toContain("orchestration_snapshot");
  });

  it("returns lease_unavailable (not null) when the lease probe cannot be proven", async () => {
    mockLeaseTableUnavailable();
    const res = await acceptRepair("ver-1");
    expect(res).toBe("lease_unavailable");
    expect(transaction).not.toHaveBeenCalled();
    expect(txUpdateSet.value).toBeUndefined();
  });

  it("returns null (not lease_unavailable) when there is genuinely no pending repair", async () => {
    mockLeaseTableExists(true);
    selectRows.value = [{ repairedFilesJson: null, filesJson: BASE_A }];
    const res = await acceptRepair("ver-1");
    expect(res).toBeNull();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txUpdateSet.value).toBeUndefined();
  });

  it("does NOT name engine_version_jobs in the statement when the table is absent (pre-migration fail-safe)", async () => {
    mockLeaseTableExists(false);
    await acceptRepair("ver-1");
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("repaired_files_json");
    expect(where).not.toContain("engine_version_jobs");
    expect(where).not.toContain("to_regclass");
  });

  it("refuses to promote a STALE envelope (files_json changed since the repair base)", async () => {
    mockLeaseTableExists(true);
    // Same envelope (base A) but the row's current files_json is now B.
    selectRows.value = [
      {
        repairedFilesJson: envelopeRow(BASE_A).repairedFilesJson,
        filesJson: '[{"path":"app/page.tsx","content":"B"}]',
      },
    ];
    const res = await acceptRepair("ver-1");
    expect(res).toBeNull();
    // No promote UPDATE was built — the user's edit (B) is left untouched.
    expect(txUpdateSet.value).toBeUndefined();
  });

  it("clears a LEGACY plain-array payload (no base hash -> fail closed, no silent overwrite)", async () => {
    mockLeaseTableExists(true);
    selectRows.value = [{ repairedFilesJson: REPAIRED_JSON, filesJson: BASE_A }];
    const res = await acceptRepair("ver-1");
    expect(res).toBeNull();
    // Fail closed by CLEARING the pending repair + marking failed, so the
    // versions/readiness routes stop advertising an un-acceptable repair forever
    // (manual accept + timed auto-accept would otherwise loop on the refusal).
    const set = txUpdateSet.value as Record<string, unknown>;
    expect(set).toBeDefined();
    expect(set.repairedFilesJson).toBeNull();
    expect(set.repairAvailableAt).toBeNull();
    expect(set.verificationState).toBe("failed");
    // files_json is never overwritten — no silent clobber of the user's edit.
    expect(set.filesJson).toBeUndefined();
    // The clear carries the SAME active-lease + exact-payload guard as the
    // promote path: it must not clear/fail the row from under a verify/repair
    // job that acquired the lease in the gap before this tx locked the row.
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("repaired_files_json");
    expect(where).toContain("not exists");
    expect(where).toContain("engine_version_jobs");
    expect(where).toContain("lease_expires_at");
  });

  it("clears a legacy payload WITHOUT naming engine_version_jobs pre-migration", async () => {
    mockLeaseTableExists(false);
    selectRows.value = [{ repairedFilesJson: REPAIRED_JSON, filesJson: BASE_A }];
    const res = await acceptRepair("ver-1");
    expect(res).toBeNull();
    const where = renderSql(txUpdateWhere.value);
    // Still binds to the exact payload, but never references the absent table.
    expect(where).toContain("repaired_files_json");
    expect(where).not.toContain("engine_version_jobs");
    expect(where).not.toContain("to_regclass");
  });
});

describe("maybeAutoAcceptTimedOutRepair — migration denial", () => {
  beforeEach(resetCaptures);

  it("returns the freshly persisted hold row when the shared accept path applies it", async () => {
    mockLeaseTableExists(true);
    txUpdateRowCount.value = 1;
    vi.mocked(assertPromoteAllowed).mockResolvedValueOnce({
      allowed: false,
      indeterminate: true,
      code: "integration_migration_required",
      reason: "integration migration requires review before promotion",
    } as never);
    const version = {
      id: "ver-1",
      verification_state: "repair_available",
      repair_available_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    } as unknown as Parameters<typeof maybeAutoAcceptTimedOutRepair>[0];
    dbSelectSequence.value = [
      [],
      [{
        id: "ver-1",
        verificationState: "pending",
        verificationSummary: "integration_migration_required:rev-a",
        filesRevision: "rev-a",
        releaseState: "draft",
        repairedFilesJson: "still-present",
        repairAvailableAt: new Date("2026-10-05T10:00:00.000Z"),
      }],
    ];

    await expect(maybeAutoAcceptTimedOutRepair(version)).resolves.toEqual({
      version: expect.objectContaining({
        id: "ver-1",
        verification_state: "pending",
        verification_summary: "integration_migration_required:rev-a",
        repaired_files_json: "still-present",
      }),
      wasAutoAccepted: false,
    });
    expect(txUpdateSet.value).toEqual(
      expect.objectContaining({
        releaseState: "draft",
        verificationState: "pending",
        verificationSummary: "integration_migration_required:rev-a",
        promotedAt: null,
      }),
    );
    const holdSet = txUpdateSet.value as Record<string, unknown>;
    expect(holdSet.repairedFilesJson).toBeUndefined();
    expect(holdSet.repairAvailableAt).toBeUndefined();
  });

  it("keeps the original repair action when a stale auto-accept no-ops and readback is unavailable", async () => {
    mockLeaseTableExists(true);
    const pendingRepair = envelopeRow(BASE_A).repairedFilesJson as string;
    const version = {
      id: "ver-1",
      verification_state: "repair_available",
      repair_available_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      files_json: BASE_A,
      files_revision: "rev-a",
      edit_kind: null,
      repaired_files_json: pendingRepair,
    } as unknown as Parameters<typeof maybeAutoAcceptTimedOutRepair>[0];
    selectRows.value = [
      {
        ...envelopeRow(BASE_A.replace("A", "B")),
        filesRevision: "rev-b",
        editKind: null,
      },
    ];
    dbSelectSequence.value = [[], []];

    const result = await maybeAutoAcceptTimedOutRepair(version);

    expect(result).toEqual({
      version,
      wasAutoAccepted: false,
    });
    expect(txUpdateSet.value).toBeUndefined();
  });

  it("returns a newer authoritative row after a stale auto-accept no-op", async () => {
    mockLeaseTableExists(true);
    const pendingRepair = envelopeRow(BASE_A).repairedFilesJson as string;
    const version = {
      id: "ver-1",
      verification_state: "repair_available",
      repair_available_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      files_json: BASE_A,
      files_revision: "rev-a",
      edit_kind: null,
      repaired_files_json: pendingRepair,
    } as unknown as Parameters<typeof maybeAutoAcceptTimedOutRepair>[0];
    selectRows.value = [{
      ...envelopeRow(BASE_A.replace("A", "B")),
      filesRevision: "rev-b",
      editKind: null,
    }];
    dbSelectSequence.value = [[], [{
      id: "ver-1",
      verificationState: "passed",
      releaseState: "promoted",
      filesRevision: "rev-b",
    }]];

    await expect(maybeAutoAcceptTimedOutRepair(version)).resolves.toEqual({
      version: expect.objectContaining({
        id: "ver-1",
        verification_state: "passed",
        release_state: "promoted",
        files_revision: "rev-b",
      }),
      wasAutoAccepted: false,
    });
  });
});

describe("holdVersionForIntegrationMigration — locked CAS", () => {
  beforeEach(resetCaptures);

  it("returns applied only after a full decision-context and lease-bound hold write", async () => {
    lockSnap.value = {
      verification_state: "repairing",
      files_revision: "rev-a",
      files_json: BASE_A,
      edit_kind: null,
      orchestration_snapshot: { contractIntegrations: [{ providerKey: "clerk" }] },
    };
    txUpdateRowCount.value = 1;

    await expect(
      holdVersionForIntegrationMigration(
        "ver-1",
        {
          verificationState: "repairing",
          filesRevision: "rev-a",
          filesJson: BASE_A,
          editKind: null,
          orchestrationSnapshot: { contractIntegrations: [{ providerKey: "clerk" }] },
        },
        "run-x",
      ),
    ).resolves.toBe("applied");

    expect(txUpdateSet.value).toMatchObject({
      releaseState: "draft",
      verificationState: "pending",
      verificationSummary: "integration_migration_required:rev-a",
      promotedAt: null,
    });
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("verification_state");
    expect(where).toContain("files_revision");
    expect(where).toContain("files_json");
    expect(where).toContain("edit_kind");
    expect(where).toContain("orchestration_snapshot");
    expect(where).toContain("engine_version_jobs");
  });

  it("returns cas_miss without UPDATE when the locked full decision context changed", async () => {
    lockSnap.value = {
      verification_state: "repairing",
      files_revision: "rev-a",
      files_json: BASE_A.replace("A", "B"),
      edit_kind: null,
      orchestration_snapshot: { contractIntegrations: [{ providerKey: "clerk" }] },
    };

    await expect(
      holdVersionForIntegrationMigration(
        "ver-1",
        {
          verificationState: "repairing",
          filesRevision: "rev-a",
          filesJson: BASE_A,
          editKind: null,
          orchestrationSnapshot: { contractIntegrations: [{ providerKey: "clerk" }] },
        },
        "run-x",
      ),
    ).resolves.toBe("cas_miss");
    expect(txUpdateSet.value).toBeUndefined();
  });

  it("re-reads context after UPDATE 0 and classifies a chat-plan TOCTOU as cas_miss", async () => {
    const expected = {
      verification_state: "repairing",
      files_revision: "rev-a",
      files_json: BASE_A,
      edit_kind: null,
      orchestration_snapshot: { contractIntegrations: [{ providerKey: "clerk" }] },
    };
    lockSnapSequence.value = [
      expected,
      {
        ...expected,
        orchestration_snapshot: { contractIntegrations: [{ providerKey: "auth0" }] },
      },
    ];
    txUpdateRowCount.value = 0;

    await expect(
      holdVersionForIntegrationMigration(
        "ver-1",
        {
          verificationState: "repairing",
          filesRevision: "rev-a",
          filesJson: BASE_A,
          editKind: null,
          orchestrationSnapshot: expected.orchestration_snapshot,
        },
        "run-x",
      ),
    ).resolves.toBe("cas_miss");
  });

  it("returns null when UPDATE 0 is only a lease/runId miss with matching context", async () => {
    lockSnap.value = {
      verification_state: "repairing",
      files_revision: "rev-a",
      files_json: BASE_A,
      edit_kind: null,
      orchestration_snapshot: null,
    };
    txUpdateRowCount.value = 0;

    await expect(
      holdVersionForIntegrationMigration(
        "ver-1",
        {
          verificationState: "repairing",
          filesRevision: "rev-a",
          filesJson: BASE_A,
          editKind: null,
          orchestrationSnapshot: null,
        },
        "run-x",
      ),
    ).resolves.toBeNull();
  });
});

describe("promoteVersion — locked files/snapshot migration guard", () => {
  beforeEach(resetCaptures);

  it("guards inside the transaction and CAS-binds files plus provider contracts", async () => {
    await promoteVersion("ver-1", "verified");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(assertPromoteAllowed).toHaveBeenCalledWith(
      "ver-1",
      undefined,
      expect.objectContaining({
        migrationContext: {
          currentFilesJson: BASE_A,
          orchestrationSnapshot: null,
        },
      }),
    );
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("files_json");
    expect(where).toContain("engine_chats");
    expect(where).toContain("orchestration_snapshot");
    expect(where).toContain("edit_kind");
  });

  it("keeps an indeterminate migration guard retryable and performs no update", async () => {
    vi.mocked(assertPromoteAllowed).mockResolvedValueOnce({
      allowed: false,
      indeterminate: true,
      reason: "migration inspection unavailable",
    } as never);
    await expect(promoteVersion("ver-1")).resolves.toBeNull();
    expect(txUpdateSet.value).toBeUndefined();
  });

  it("returns a typed migration hold only after the revision-bound hold update applies", async () => {
    vi.mocked(assertPromoteAllowed).mockResolvedValueOnce({
      allowed: false,
      indeterminate: true,
      code: "integration_migration_required",
      reason: "provider migration requires review",
    } as never);

    txUpdateRowCount.value = 1;
    await expect(promoteVersion("ver-1")).resolves.toBe(
      "integration_migration_required",
    );
    expect(txUpdateSet.value).toMatchObject({
      releaseState: "draft",
      verificationState: "pending",
      promotedAt: null,
    });
    expect(String((txUpdateSet.value as Record<string, unknown>).verificationSummary)).toContain(
      "integration_migration_required",
    );
    expect(txUpdateSet.value).not.toHaveProperty("repairedFilesJson");
  });

  it("returns ordinary null when the migration-hold CAS update misses", async () => {
    vi.mocked(assertPromoteAllowed).mockResolvedValueOnce({
      allowed: false,
      indeterminate: true,
      code: "integration_migration_required",
      reason: "provider migration requires review",
    } as never);
    txUpdateRowCount.value = 0;
    await expect(promoteVersion("ver-1")).resolves.toBeNull();
  });

  it("scopes a restore away from latest contracts while CAS-binding edit_kind", async () => {
    lockSnap.value = {
      ...lockSnap.value,
      edit_kind: "restore",
      orchestration_snapshot: { contractIntegrations: [{ providerKey: "auth0" }] },
    };
    await promoteVersion("ver-1", "verified");
    expect(assertPromoteAllowed).toHaveBeenCalledWith(
      "ver-1",
      undefined,
      expect.objectContaining({
        migrationContext: expect.objectContaining({ orchestrationSnapshot: null }),
      }),
    );
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("edit_kind");
    expect(where).not.toContain("orchestration_snapshot");
  });

  it.each(["40001", "08006"])(
    "returns retryable null for transient context read %s",
    async (code) => {
      txExecuteFailure.match = "for update";
      txExecuteFailure.error = pgError(code);
      await expect(promoteVersion("ver-1")).resolves.toBeNull();
      expect(txUpdateSet.value).toBeUndefined();
    },
  );

  it("returns null for the bounded lock timeout", async () => {
    txExecuteFailure.match = "for update";
    txExecuteFailure.error = pgError("55P03");
    await expect(promoteVersion("ver-1")).resolves.toBeNull();
  });

  it("does not hide a non-transient context read failure", async () => {
    txExecuteFailure.match = "for update";
    txExecuteFailure.error = pgError("42501");
    await expect(promoteVersion("ver-1")).rejects.toMatchObject({ code: "42501" });
  });

  it("rethrows a transient UPDATE failure for promoteVersionWithRetry", async () => {
    txUpdateFailure.value = pgError("40001");
    await expect(promoteVersion("ver-1")).rejects.toMatchObject({ code: "40001" });
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
  const CAS_VERIFYING_NULL = {
    verificationState: "verifying" as const,
    filesRevision: null,
  };

  beforeEach(resetCaptures);

  it("locks the version row (FOR UPDATE) and enforces no-active-lease when the table exists", async () => {
    mockLeaseTableExists(true);
    const res = await failVersionVerificationIfUnleased(
      "ver-1",
      "stuck repair recovered",
      CAS_VERIFYING_NULL,
    );
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
    expect(where).toContain("created_at");
    expect(where).toContain("updated_at");
    expect(where).toContain("now()");
  });

  it("no-ops without building an UPDATE when the lease probe is unavailable", async () => {
    mockLeaseTableUnavailable();
    const res = await failVersionVerificationIfUnleased(
      "ver-1",
      "stuck repair recovered",
      CAS_VERIFYING_NULL,
    );
    expect(res).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
    expect(txUpdateWhere.value).toBeUndefined();
  });

  it("degrades to an unconditional watchdog (no lease table reference) pre-migration", async () => {
    mockLeaseTableExists(false);
    await failVersionVerificationIfUnleased("ver-1", "stuck repair recovered", CAS_VERIFYING_NULL);
    const where = renderSql(txUpdateWhere.value);
    expect(where).not.toContain("engine_version_jobs");
    expect(where).not.toContain("to_regclass");
    // Still serializes via the row lock even pre-migration.
    const lockStmts = txExecSqls.value.map((s) => renderSql(s));
    expect(lockStmts.some((s) => s.includes("for update"))).toBe(true);
  });

  it("CAS-binds the fail UPDATE to expected verification_state and IS NULL files_revision (L5 c)", async () => {
    mockLeaseTableExists(true);
    await failVersionVerificationIfUnleased("ver-1", "stale timeout", CAS_VERIFYING_NULL);
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("verification_state");
    expect(where).toContain("files_revision");
    expect(where).toContain("is null");
  });

  it("CAS-binds a non-null files_revision with equality, not IS NULL (L5)", async () => {
    mockLeaseTableExists(true);
    lockSnap.value = { ...lockSnap.value, verification_state: "verifying", files_revision: "rev-a" };
    await failVersionVerificationIfUnleased("ver-1", "stale timeout", {
      verificationState: "verifying",
      filesRevision: "rev-a",
    });
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("files_revision");
    expect(where).not.toContain("is null");
  });

  it("returns cas_miss with no error log when the row was promoted under the await (L5 a)", async () => {
    mockLeaseTableExists(true);
    lockSnap.value = { ...lockSnap.value, verification_state: "passed", files_revision: "rev-a" };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await failVersionVerificationIfUnleased("ver-1", "stale timeout", {
      verificationState: "verifying",
      filesRevision: "rev-a",
    });
    expect(res).toEqual({ applied: false, reason: "cas_miss" });
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
  });

  it("returns cas_miss when files_revision advanced to B under the await (L5 b)", async () => {
    mockLeaseTableExists(true);
    lockSnap.value = { ...lockSnap.value, verification_state: "verifying", files_revision: "rev-b" };
    const res = await failVersionVerificationIfUnleased("ver-1", "stale timeout", {
      verificationState: "verifying",
      filesRevision: "rev-a",
    });
    expect(res).toEqual({ applied: false, reason: "cas_miss" });
  });

  it("returns cas_miss when expected NULL revision meets a hashed row (L5 c)", async () => {
    mockLeaseTableExists(true);
    lockSnap.value = { ...lockSnap.value, verification_state: "verifying", files_revision: "hashed" };
    const res = await failVersionVerificationIfUnleased("ver-1", "stale timeout", CAS_VERIFYING_NULL);
    expect(res).toEqual({ applied: false, reason: "cas_miss" });
  });
});

describe("promoteVersionIfUnleased — lease-safe reconciliation promote (Bugbot high #518)", () => {
  // Mirrors failVersionVerificationIfUnleased: a proven-green stale row is
  // reconciled to promoted ONLY when no active lease owns it, serialized via a
  // FOR UPDATE row lock, and never referencing the jobs table pre-migration. It
  // additionally runs the SAME false-green promote-guard as promoteVersion.
  beforeEach(resetCaptures);

  it("scopes a restore away from latest contracts while keeping edit_kind in the CAS", async () => {
    mockLeaseTableExists(true);
    lockSnap.value = {
      ...lockSnap.value,
      edit_kind: "restore",
      orchestration_snapshot: { contractIntegrations: [{ providerKey: "auth0" }] },
    };
    await promoteVersionIfUnleased("ver-1", "reconciled");
    expect(assertPromoteAllowed).toHaveBeenCalledWith(
      "ver-1",
      undefined,
      expect.objectContaining({
        migrationContext: expect.objectContaining({ orchestrationSnapshot: null }),
      }),
    );
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("edit_kind");
    expect(where).not.toContain("orchestration_snapshot");
  });

  it("promotes to passed/promoted, locks the row (FOR UPDATE), and enforces no-active-lease when the table exists", async () => {
    mockLeaseTableExists(true);
    const res = await promoteVersionIfUnleased("ver-1", "reconciled");
    expect(res).toBeNull(); // rowCount 0 -> an active lease still owns it; left intact
    // Terminal promote SET.
    const set = txUpdateSet.value as Record<string, unknown>;
    expect(set.releaseState).toBe("promoted");
    expect(set.verificationState).toBe("passed");
    expect(set.verificationSummary).toBe("reconciled");
    // Row lock taken before the conditional UPDATE.
    const lockStmts = txExecSqls.value.map((s) => renderSql(s));
    expect(
      lockStmts.some((s) => s.includes("for update") && s.includes("engine_versions")),
    ).toBe(true);
    // The write is gated on no active lease.
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("not exists");
    expect(where).toContain("engine_version_jobs");
    expect(where).toContain("lease_expires_at");
    expect(where).toContain("now()");
    // P1a (Codex round 2): the write is ALSO gated on the row still being
    // `verifying`, so a concurrent client-retry that already failed/passed it
    // makes this a no-op (can't flip a freshly-failed row back to passed).
    expect(where).toContain("verification_state");
    expect(where).toContain("files_json");
    expect(where).toContain("engine_chats");
    expect(where).toContain("orchestration_snapshot");
    expect(where).toContain("edit_kind");
    expect(assertPromoteAllowed).toHaveBeenCalledWith(
      "ver-1",
      undefined,
      expect.objectContaining({
        migrationContext: {
          currentFilesJson: BASE_A,
          orchestrationSnapshot: null,
        },
      }),
    );
  });

  it("CAS-binds files_revision when the caller supplies the snapshot (L5)", async () => {
    mockLeaseTableExists(true);
    await promoteVersionIfUnleased("ver-1", "reconciled", { filesRevision: null });
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("verification_state");
    expect(where).toContain("files_revision");
    expect(where).toContain("is null");
  });

  it("omits files_revision CAS when the snapshot is not supplied (pre-L5 callers / L4 tests)", async () => {
    mockLeaseTableExists(true);
    await promoteVersionIfUnleased("ver-1", "reconciled");
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("verification_state");
    expect(where).not.toContain("files_revision");
  });

  it("no-ops without building a promote when the lease probe is unavailable", async () => {
    mockLeaseTableUnavailable();
    const res = await promoteVersionIfUnleased("ver-1", "reconciled");
    expect(res).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
    expect(txUpdateSet.value).toBeUndefined();
  });

  it("returns retryable null on a transient locked-context read failure", async () => {
    mockLeaseTableExists(true);
    txExecuteFailure.match = "for update";
    txExecuteFailure.error = pgError("40001");
    await expect(promoteVersionIfUnleased("ver-1")).resolves.toBeNull();
    expect(txUpdateSet.value).toBeUndefined();
  });

  it("does not hide a non-transient locked-context read failure", async () => {
    mockLeaseTableExists(true);
    txExecuteFailure.match = "for update";
    txExecuteFailure.error = pgError("42501");
    await expect(promoteVersionIfUnleased("ver-1")).rejects.toMatchObject({ code: "42501" });
  });

  it("rethrows transient UPDATE failures", async () => {
    mockLeaseTableExists(true);
    txUpdateFailure.value = pgError("40001");
    await expect(promoteVersionIfUnleased("ver-1")).rejects.toMatchObject({ code: "40001" });
  });

  it("degrades to an unconditional promote (no lease table reference) pre-migration — but still guards verifying-state", async () => {
    mockLeaseTableExists(false);
    await promoteVersionIfUnleased("ver-1", "reconciled");
    const where = renderSql(txUpdateWhere.value);
    expect(where).not.toContain("engine_version_jobs");
    expect(where).not.toContain("to_regclass");
    // P1a: the verifying-state guard is independent of the lease table.
    expect(where).toContain("verification_state");
    // Still serializes via the row lock even pre-migration.
    const lockStmts = txExecSqls.value.map((s) => renderSql(s));
    expect(lockStmts.some((s) => s.includes("for update"))).toBe(true);
  });

  it("returns 'guard_denied' (not null) on an EXPLICIT guard denial, never builds the promote (P1b)", async () => {
    mockLeaseTableExists(true);
    vi.mocked(assertPromoteAllowed).mockResolvedValueOnce({
      allowed: false,
      reason: "verifier_failed",
    } as never);
    const res = await promoteVersionIfUnleased("ver-1", "reconciled");
    // Explicit denial is a fresher truth than the stale gate log → the caller
    // must settle terminally, so we signal it distinctly from a retryable null.
    expect(res).toBe("guard_denied");
    // Guard runs after the locked files/snapshot read, before UPDATE.
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txUpdateSet.value).toBeUndefined();
  });

  it("returns null (retryable) when the guard is INDETERMINATE (read error), never builds the promote (P1b)", async () => {
    mockLeaseTableExists(true);
    vi.mocked(assertPromoteAllowed).mockResolvedValueOnce({
      allowed: false,
      indeterminate: true,
      reason: "promote guard signal unavailable: db timeout",
    } as never);
    const res = await promoteVersionIfUnleased("ver-1", "reconciled");
    expect(res).toBeNull();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txUpdateSet.value).toBeUndefined();
  });

  it("returns a typed migration hold instead of a truthy version after a lease-safe hold write", async () => {
    mockLeaseTableExists(true);
    vi.mocked(assertPromoteAllowed).mockResolvedValueOnce({
      allowed: false,
      indeterminate: true,
      code: "integration_migration_required",
      reason: "provider migration requires review",
    } as never);

    txUpdateRowCount.value = 1;
    const res = await promoteVersionIfUnleased("ver-1", "reconciled");

    expect(res).toBe("integration_migration_required");
    expect(txUpdateSet.value).toMatchObject({
      releaseState: "draft",
      verificationState: "pending",
      promotedAt: null,
    });
    const where = renderSql(txUpdateWhere.value);
    expect(where).toContain("not exists");
    expect(where).toContain("verification_state");
    expect(where).toContain("files_revision");
  });

  it("returns ordinary null when the unleased hold loses its CAS or lease race", async () => {
    mockLeaseTableExists(true);
    vi.mocked(assertPromoteAllowed).mockResolvedValueOnce({
      allowed: false,
      indeterminate: true,
      code: "integration_migration_required",
      reason: "provider migration requires review",
    } as never);
    txUpdateRowCount.value = 0;
    await expect(promoteVersionIfUnleased("ver-1", "reconciled")).resolves.toBeNull();
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
