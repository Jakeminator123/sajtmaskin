import { describe, expect, it, vi } from "vitest";
import {
  applyAlignment,
  assertDevSessionTarget,
  MAIL_MIGRATION,
  validateAlignmentPlan,
} from "./align-dev-preview.mjs";

const dev =
  "postgres://postgres.yubbckduwblyrbnlglwf:pw@aws-1-eu-north-1.pooler.supabase.com:5432/postgres";
const pending = () => ({
  ledgerPresent: true,
  mailLedgered: false,
  mailTable: false,
  mailColumn: false,
  legacyTables: [
    { name: "kostnadsfri_pixel_hits", present: true, archived: false, rows: 0, dependencies: 0 },
  ],
});

describe("DEV alignment boundaries", () => {
  it("refuses production, unknown databases and transaction pooling even with a write override", () => {
    expect(assertDevSessionTarget(dev).projectRef).toBe("yubbckduwblyrbnlglwf");
    for (const url of [
      dev.replace(":5432", ":6543"),
      dev.replace("yubbckduwblyrbnlglwf", "egcitvwgettkftkyzbvn"),
      "postgres://postgres:pw@localhost:5432/postgres",
    ]) {
      expect(() => assertDevSessionTarget(url)).toThrow();
    }
  });

  it("refuses retirement when rows or consumers appear", () => {
    for (const change of [{ rows: 1 }, { dependencies: 1 }, { archived: true }]) {
      const plan = pending();
      Object.assign(plan.legacyTables[0], change);
      expect(() => validateAlignmentPlan(plan)).toThrow();
    }
  });

  it("does not bless partial/unledgered DDL or reapply a ledgered missing schema", () => {
    for (const change of [
      { mailTable: true },
      { mailColumn: true },
      { mailLedgered: true },
      { ledgerPresent: false },
    ]) {
      expect(() => validateAlignmentPlan({ ...pending(), ...change })).toThrow();
    }
  });
});

describe("DEV alignment transaction", () => {
  function fakeClient(failLedger = false) {
    let mail = false;
    let ledgered = false;
    let retired = false;
    const query = vi.fn(async (sql: string, params?: string[]) => {
      if (sql.startsWith("SELECT filename"))
        return { rows: ledgered ? [{ filename: MAIL_MIGRATION }] : [] };
      if (sql.includes("AS table_present"))
        return { rows: [{ table_present: mail, column_present: mail }] };
      if (sql.includes("AS archived")) return { rows: [{ present: !retired, archived: retired }] };
      if (sql.includes("AS rows")) return { rows: [{ rows: "0" }] };
      if (sql.includes("AS dependencies")) return { rows: [{ dependencies: 0 }] };
      if (sql === "MAIL DDL") mail = true;
      if (sql.startsWith("INSERT INTO schema_migrations")) {
        if (failLedger) throw new Error("ledger write failed");
        expect(params).toEqual([MAIL_MIGRATION]);
        ledgered = true;
      }
      if (sql.startsWith("ALTER TABLE public.")) retired = true;
      return { rows: [] };
    });
    return { query };
  }

  it("rolls back the mail DDL when the ledger write fails", async () => {
    const client = fakeClient(true);
    await expect(applyAlignment(client, "MAIL DDL")).rejects.toThrow("ledger write failed");
    const statements = client.query.mock.calls.map(([sql]) => sql);
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
    expect(statements.some((sql) => sql.startsWith("ALTER TABLE public."))).toBe(false);
  });

  it("rechecks locked tables and commits archival together with the mail ledger entry", async () => {
    const client = fakeClient();
    await applyAlignment(client, "MAIL DDL");
    const statements = client.query.mock.calls.map(([sql]) => sql);
    expect(statements.some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(statements.some((sql) => sql.includes("ACCESS EXCLUSIVE MODE"))).toBe(true);
    expect(statements).toContain("COMMIT");
    expect(statements.some((sql) => /DROP|DELETE|UPDATE schema_migrations/.test(sql))).toBe(false);
  });

  it("does not rerun mail DDL or rewrite history when alignment is retried", async () => {
    const client = fakeClient();
    await applyAlignment(client, "MAIL DDL");
    client.query.mockClear();
    await applyAlignment(client, "MAIL DDL");
    const statements = client.query.mock.calls.map(([sql]) => sql);
    expect(statements).toContain("COMMIT");
    expect(statements).not.toContain("MAIL DDL");
    expect(
      statements.some((sql) => sql.startsWith("INSERT") || sql.startsWith("ALTER TABLE")),
    ).toBe(false);
  });
});
