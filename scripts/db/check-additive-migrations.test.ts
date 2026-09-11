import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BREAKING_STATEMENTS,
  classifyPendingMigrations,
  findBreakingStatements,
  maskSqlComments,
} from "./check-additive-migrations.mjs";

/**
 * Grinden står mellan staging och en DELAD produktionsdatabas, så båda
 * felriktningarna kostar: en falsk träff gör att man stänger av den, en missad
 * träff släpper brytande DDL mot den databas produktionen läser. Varje rad här
 * är ett av de två felen.
 */
describe("findBreakingStatements", () => {
  it("släpper igenom den additiva formen som hela konventionen bygger på", () => {
    const additive = `
      CREATE TABLE IF NOT EXISTS pricing_settings (
        id text PRIMARY KEY,
        domain_markup_basis_points integer NOT NULL DEFAULT 20000
      );
      ALTER TABLE pricing_settings
        ADD COLUMN IF NOT EXISTS credit_action_prices jsonb NOT NULL DEFAULT '{}'::jsonb;
      CREATE INDEX IF NOT EXISTS pricing_settings_updated_idx ON pricing_settings (updated_at);
    `;
    expect(findBreakingStatements(additive)).toEqual([]);
  });

  it("fångar varje brytande form, även över radbrytning", () => {
    const found = (sql: string) => findBreakingStatements(sql).map((f) => f.id);
    expect(found("ALTER TABLE t DROP COLUMN c;")).toContain("drop-column");
    expect(found("ALTER TABLE t\n  DROP\n  COLUMN c;")).toContain("drop-column");
    expect(found("DROP TABLE legacy_sites;")).toContain("drop-table");
    expect(found("ALTER TABLE t RENAME COLUMN a TO b;")).toContain("rename");
    expect(found("ALTER TABLE t ALTER COLUMN c TYPE text;")).toContain("alter-column-type");
    expect(found("ALTER TABLE t ALTER COLUMN c SET DATA TYPE text;")).toContain(
      "alter-column-type",
    );
    expect(found("ALTER TABLE t ALTER COLUMN c SET NOT NULL;")).toContain("set-not-null");
    expect(found("ALTER TABLE t ALTER COLUMN c DROP DEFAULT;")).toContain("drop-default");
    expect(found("TRUNCATE registry_cache;")).toContain("truncate");
    expect(found("DELETE FROM engine_versions WHERE id = 'x';")).toContain("delete-from");
  });

  it("läser inuti en DO-kropp — det är där den riktiga DROP COLUMN gömmer sig", () => {
    const guarded = `
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE column_name = 'id') THEN
          ALTER TABLE registry_cache DROP COLUMN id;
        END IF;
      END
      $$;
    `;
    const findings = findBreakingStatements(guarded);
    expect(findings.map((f) => f.id)).toEqual(["drop-column"]);
    expect(findings[0].snippet).toContain("ALTER TABLE registry_cache DROP COLUMN id;");
  });

  it("låter sig inte luras av kommentarer eller stränglitteraler", () => {
    expect(
      findBreakingStatements(`
        -- safe to reshape; DROP COLUMN also drops registry_cache_pkey.
        /* TRUNCATE was considered and rejected.
           DROP TABLE too. */
        ALTER TABLE t ADD COLUMN IF NOT EXISTS c text;
      `),
    ).toEqual([]);
    expect(
      findBreakingStatements("INSERT INTO audit (note) VALUES ('DROP COLUMN was skipped');"),
    ).toEqual([]);
  });

  it("fångar dynamisk DDL i en DO-kropp — där är strängen körbar", () => {
    const dynamic = `
      DO $$
      BEGIN
        EXECUTE 'ALTER TABLE registry_cache DROP COLUMN id';
      END
      $$;
    `;
    expect(findBreakingStatements(dynamic).map((f) => f.id)).toEqual(["drop-column"]);
  });

  it("läser typbyte även med citerad identifierare", () => {
    expect(
      findBreakingStatements('ALTER TABLE t ALTER COLUMN "my col" TYPE text;').map((f) => f.id),
    ).toEqual(["alter-column-type"]);
  });

  it("håller sig utanför drop-och-återskapa-idiomen", () => {
    // Dessa flyttar inte marken under gammal kod, och en falsk träff här skulle
    // rödfärga nästan varje RLS- eller FK-migration.
    expect(
      findBreakingStatements(`
        DROP POLICY IF EXISTS wizard_runs_owner ON wizard_runs;
        CREATE POLICY wizard_runs_owner ON wizard_runs USING (true);
        DROP TRIGGER IF EXISTS t_set_updated ON engine_versions;
        DROP INDEX IF EXISTS engine_versions_stale_idx;
        ALTER TABLE engine_chats DROP CONSTRAINT IF EXISTS engine_chats_project_fk;
        UPDATE pricing_settings SET domain_usd_to_sek_ore = 1100 WHERE id = 'default';
      `),
    ).toEqual([]);
  });

  it("rapporterar rad och orsak så beskedet går att agera på", () => {
    const findings = findBreakingStatements("SELECT 1;\n\nALTER TABLE t DROP COLUMN gone;\n");
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(3);
    expect(findings[0].why).toContain("gammal kod");
  });
});

describe("maskSqlComments", () => {
  it("bevarar offset och radbrytningar så radnumren pekar rätt", () => {
    const sql = "SELECT 1; -- DROP TABLE x\nSELECT 2;";
    const masked = maskSqlComments(sql);
    expect(masked).toHaveLength(sql.length);
    expect(masked.split("\n")).toHaveLength(2);
    expect(masked).not.toContain("DROP TABLE");
  });

  it("hanterar nästlade blockkommentarer", () => {
    expect(maskSqlComments("/* a /* DROP TABLE x */ b */ SELECT 1;").trim()).toBe("SELECT 1;");
  });

  it("lämnar en oavslutad kommentar maskerad i stället för att släppa den vidare", () => {
    expect(maskSqlComments("SELECT 1; /* DROP TABLE x")).not.toContain("DROP TABLE");
  });
});

describe("classifyPendingMigrations", () => {
  it("läser från migrationskatalogen och klassar per fil", () => {
    const result = classifyPendingMigrations(["additive.sql", "breaking.sql"], {
      migrationsDir: "fake",
      readFile: (path) =>
        path.endsWith("additive.sql")
          ? "ALTER TABLE t ADD COLUMN IF NOT EXISTS c text;"
          : "ALTER TABLE t DROP COLUMN c;",
    });
    expect(result[0]).toEqual({ filename: "additive.sql", findings: [] });
    expect(result[1].findings.map((f) => f.id)).toEqual(["drop-column"]);
  });

  it("är tom för en tom pending-lista", () => {
    expect(classifyPendingMigrations([])).toEqual([]);
  });

  /**
   * Den historiska migrationen som bevisar att grinden behövs — och att den
   * bara får granska PENDING filer. Den här är applicerad för länge sedan; om
   * den någonsin klassas som additiv har maskeringen eller DO-kroppsläsningen
   * gått sönder.
   */
  it("klassar repots egna kända brytande migration som brytande", () => {
    const sql = readFileSync(
      join("src", "lib", "db", "migrations", "align-live-schema-parity.sql"),
      "utf8",
    );
    expect(findBreakingStatements(sql).map((f) => f.id)).toContain("drop-column");
  });
});

describe("BREAKING_STATEMENTS", () => {
  it("är frusen och har unika id:n, så listan inte kan tunnas ut oavsiktligt", () => {
    expect(Object.isFrozen(BREAKING_STATEMENTS)).toBe(true);
    const ids = BREAKING_STATEMENTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "drop-table",
      "drop-column",
      "rename",
      "alter-column-type",
      "set-not-null",
      "drop-default",
      "truncate",
      "delete-from",
    ]);
  });
});
