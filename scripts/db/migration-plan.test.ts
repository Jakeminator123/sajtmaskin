import { describe, expect, it, vi } from "vitest";
import {
  assertLockAcquiredBeforeApply,
  assertPlanExecutable,
  buildMigrationPlan,
  checksumSql,
  classifyUnledgeredApplyError,
  executeMigrationFile,
  planFilenamesToApply,
  shouldRunScheduledSchemaParity,
  sqlRequiresNonTransactional,
  withMigrationAdvisoryLock,
  MIGRATION_LOCK_KEY1,
  MIGRATION_LOCK_KEY2,
} from "./migration-plan.mjs";
import { isAlreadyExistsError } from "./migration-order.mjs";

function files(entries: Record<string, string>) {
  return new Map(Object.entries(entries));
}

function appliedMap(
  entries: Record<string, string | null>,
): Map<string, { checksum: string | null }> {
  return new Map(
    Object.entries(entries).map(([filename, checksum]) => [filename, { checksum }]),
  );
}

describe("buildMigrationPlan", () => {
  const order = ["a.sql", "b.sql", "c.sql"] as const;

  it("plans a new migration once; a second plan with it ledgered applies nothing", () => {
    const sql = { "a.sql": "SELECT 1;", "b.sql": "SELECT 2;", "c.sql": "SELECT 3;" };
    const first = buildMigrationPlan({
      order,
      applied: null,
      files: files(sql),
    });
    expect(planFilenamesToApply(first)).toEqual(["a.sql", "b.sql", "c.sql"]);

    const afterA = appliedMap({
      "a.sql": checksumSql(sql["a.sql"]),
    });
    const second = buildMigrationPlan({
      order,
      applied: afterA,
      files: files(sql),
    });
    expect(planFilenamesToApply(second)).toEqual(["b.sql", "c.sql"]);
    expect(second.skipped).toContainEqual({
      filename: "a.sql",
      reason: "already-applied",
    });
  });

  it("detects modified already-applied migration when a checksum is stored", () => {
    const original = "CREATE TABLE t (id int);";
    const modified = "CREATE TABLE t (id int, name text);";
    const plan = buildMigrationPlan({
      order: ["a.sql"],
      applied: appliedMap({ "a.sql": checksumSql(original) }),
      files: files({ "a.sql": modified }),
    });
    expect(plan.toApply).toEqual([]);
    expect(plan.mismatches).toEqual([
      {
        filename: "a.sql",
        ledgerChecksum: checksumSql(original),
        fileChecksum: checksumSql(modified),
      },
    ]);
    expect(() => assertPlanExecutable(plan)).toThrow(/Checksum mismatch/);
  });

  it("does not re-run legacy rows without checksum and does not invent today's hash", () => {
    const sql = "CREATE TABLE legacy (id int);";
    const today = checksumSql(sql);
    const plan = buildMigrationPlan({
      order: ["legacy.sql"],
      applied: appliedMap({ "legacy.sql": null }),
      files: files({ "legacy.sql": sql }),
    });
    expect(plan.toApply).toEqual([]);
    expect(plan.skipped).toEqual([{ filename: "legacy.sql", reason: "legacy-no-checksum" }]);
    expect(plan.mismatches).toEqual([]);
    // Plan must not treat today's hash as historical proof.
    expect(today).toMatch(/^[a-f0-9]{64}$/);
  });

  it("control's approved pending set is exactly what the runner would execute", () => {
    const sql = {
      "a.sql": "SELECT 1;",
      "b.sql": "SELECT 2;",
      "c.sql": "SELECT 3;",
    };
    const applied = appliedMap({
      "a.sql": checksumSql(sql["a.sql"]),
      "b.sql": null,
    });
    const plan = buildMigrationPlan({ order, applied, files: files(sql) });
    // a checksum-matched → skip; b legacy → skip; c missing → apply
    expect(planFilenamesToApply(plan)).toEqual(["c.sql"]);
    expect(plan.skipped.map((s) => s.filename).sort()).toEqual(["a.sql", "b.sql"]);
  });
});

describe("executeMigrationFile", () => {
  it("does not record a ledger receipt when SQL fails", async () => {
    const statements: string[] = [];
    const client = {
      async query(text: string) {
        statements.push(text);
        if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return;
        if (text.startsWith("INSERT INTO schema_migrations")) {
          throw new Error("ledger should not be reached after SQL failure");
        }
        throw Object.assign(new Error("syntax error"), { code: "42601" });
      },
    };
    await expect(
      executeMigrationFile(client, {
        filename: "bad.sql",
        sql: "NOT VALID SQL;",
        checksum: checksumSql("NOT VALID SQL;"),
      }),
    ).rejects.toMatchObject({ code: "42601" });
    expect(statements.some((s) => s.startsWith("INSERT INTO schema_migrations"))).toBe(false);
    expect(statements).toContain("ROLLBACK");
  });

  it("refuses to record already-exists on an unledgered file", async () => {
    const client = {
      async query(text: string) {
        if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return;
        if (text.startsWith("INSERT INTO schema_migrations")) {
          throw new Error("must not record");
        }
        throw Object.assign(new Error('relation "t" already exists'), { code: "42P07" });
      },
    };
    await expect(
      executeMigrationFile(client, {
        filename: "new.sql",
        sql: "CREATE TABLE t (id int);",
        checksum: "abc",
      }),
    ).rejects.toThrow(/not in schema_migrations.*already-exists/i);
  });

  it("records checksum inside the same transaction after successful SQL", async () => {
    const statements: string[] = [];
    const client = {
      async query(text: string, params?: unknown[]) {
        statements.push(params ? `${text} :: ${JSON.stringify(params)}` : text);
        return { rows: [] };
      },
    };
    const sql = "CREATE TABLE IF NOT EXISTS t (id int);";
    const checksum = checksumSql(sql);
    await executeMigrationFile(client, { filename: "t.sql", sql, checksum });
    expect(statements[0]).toBe("BEGIN");
    expect(statements[1]).toBe(sql);
    expect(statements[2]).toMatch(/INSERT INTO schema_migrations/);
    expect(statements[2]).toContain(checksum);
    expect(statements[3]).toBe("COMMIT");
  });

  it("does not wrap CONCURRENTLY SQL in a transaction", async () => {
    const statements: string[] = [];
    const client = {
      async query(text: string) {
        statements.push(text);
        return { rows: [] };
      },
    };
    const sql = "CREATE INDEX CONCURRENTLY IF NOT EXISTS t_idx ON t (id);";
    expect(sqlRequiresNonTransactional(sql)).toBe(true);
    await executeMigrationFile(client, {
      filename: "idx.sql",
      sql,
      checksum: checksumSql(sql),
    });
    expect(statements).not.toContain("BEGIN");
    expect(statements[0]).toBe(sql);
    expect(statements.some((s) => s.startsWith("INSERT INTO schema_migrations"))).toBe(true);
  });
});

describe("advisory lock contract", () => {
  it("acquires the migration lock before apply work", async () => {
    const statements: string[] = [];
    const client = {
      async query(text: string, params?: unknown[]) {
        statements.push(params ? `${text} [${params.join(",")}]` : text);
        return { rows: [] };
      },
      release: vi.fn(),
    };
    const pool = {
      async connect() {
        return client;
      },
    };

    await withMigrationAdvisoryLock(pool, async (locked) => {
      await locked.query("CREATE TABLE IF NOT EXISTS demo (id int)");
    });

    expect(statements[0]).toContain("pg_advisory_lock");
    expect(statements[0]).toContain(String(MIGRATION_LOCK_KEY1));
    expect(statements[0]).toContain(String(MIGRATION_LOCK_KEY2));
    expect(assertLockAcquiredBeforeApply(statements)).toBe(true);
    expect(statements.some((s) => s.includes("pg_advisory_unlock"))).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  it("assertLockAcquiredBeforeApply rejects DDL before lock", () => {
    expect(() =>
      assertLockAcquiredBeforeApply([
        "CREATE TABLE t (id int)",
        "SELECT pg_advisory_lock(1, 2)",
      ]),
    ).toThrow(/before advisory lock/);
  });
});

describe("classifyUnledgeredApplyError", () => {
  it("turns already-exists into a hard failure without a ledger receipt", () => {
    const err = classifyUnledgeredApplyError("x.sql", {
      code: "42P07",
      message: "already exists",
    });
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/Refusing to record/);
    expect(isAlreadyExistsError({ code: "42P07" })).toBe(true);
  });
});

describe("shouldRunScheduledSchemaParity", () => {
  it("runs on schedule even when default branch tip is preview", () => {
    expect(
      shouldRunScheduledSchemaParity({
        eventName: "schedule",
        ref: "refs/heads/preview",
      }),
    ).toBe(true);
  });

  it("allows workflow_dispatch only from master", () => {
    expect(
      shouldRunScheduledSchemaParity({
        eventName: "workflow_dispatch",
        ref: "refs/heads/master",
      }),
    ).toBe(true);
    expect(
      shouldRunScheduledSchemaParity({
        eventName: "workflow_dispatch",
        ref: "refs/heads/preview",
      }),
    ).toBe(false);
    expect(
      shouldRunScheduledSchemaParity({
        eventName: "workflow_dispatch",
        ref: "refs/heads/fix/db-migration-plan",
      }),
    ).toBe(false);
  });
});
