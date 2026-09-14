import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BREAKING_STATEMENTS,
  classifyPendingMigrations,
  findBreakingStatements,
  maskSqlComments,
  parseCreatedTables,
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
    expect(found("ALTER TABLE t ADD CONSTRAINT t_email_unique UNIQUE (email);")).toContain(
      "add-constraint",
    );
    expect(found("ALTER TABLE t ADD UNIQUE (email);")).toContain("add-unique");
    expect(found("ALTER TABLE t ADD PRIMARY KEY (id);")).toContain("add-primary-key");
    expect(found("ALTER TABLE t ADD FOREIGN KEY (user_id) REFERENCES users (id);")).toContain(
      "add-foreign-key",
    );
    expect(found("ALTER TABLE t ADD COLUMN email TEXT UNIQUE;")).toContain("add-column-unique");
    expect(found("CREATE UNIQUE INDEX t_email_uidx ON t (email);")).toContain(
      "create-unique-index",
    );
    expect(found("ALTER TABLE t ADD COLUMN email TEXT;")).not.toContain("add-column-unique");
    expect(found("CREATE TABLE IF NOT EXISTS t (id text PRIMARY KEY, email text UNIQUE);")).toEqual(
      [],
    );
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

    expect(
      findBreakingStatements(
        "DO $guard1$ BEGIN ALTER TABLE registry_cache DROP COLUMN legacy; END $guard1$;",
      ).map((finding) => finding.id),
    ).toEqual(["drop-column"]);
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

  it("ger ingen dispens utan uttrycklig lista över nya tabeller", () => {
    // Default är det strängaste svaret: vet grinden inget om måldatabasen kan
    // den inte veta att tabellen är ny.
    expect(
      findBreakingStatements("ALTER TABLE t ADD CONSTRAINT t_u UNIQUE (a, b);").map((f) => f.id),
    ).toEqual(["add-constraint"]);
  });

  it("släpper en constraint mot en tabell som omgången själv skapar och som saknas i databasen", () => {
    // Den formen kan inte ogiltigförklara någon rad eller någon INSERT från den
    // gamla produktionskoden: tabellen finns inte där än.
    expect(
      findBreakingStatements(
        `CREATE TABLE IF NOT EXISTS site_subscriptions (id text PRIMARY KEY);
         ALTER TABLE site_subscriptions
           ADD CONSTRAINT site_subscriptions_id_mode_unique UNIQUE (id, billing_mode);`,
        { exemptTables: ["site_subscriptions"] },
      ),
    ).toEqual([]);
  });

  it("håller dispensen på rätt tabell inom samma fil", () => {
    const findings = findBreakingStatements(
      `ALTER TABLE site_subscriptions ADD CONSTRAINT a UNIQUE (id, billing_mode);
       ALTER TABLE users ADD CONSTRAINT b UNIQUE (email);`,
      { exemptTables: ["site_subscriptions"] },
    );
    expect(findings.map((f) => f.id)).toEqual(["add-constraint"]);
    expect(findings[0].snippet).toContain("ALTER TABLE users");
  });

  it("ger ingen dispens när måltabellen bara finns som dynamisk sträng", () => {
    // `EXECUTE format('ALTER TABLE %I …')` går inte att knyta till en tabell
    // statiskt, och då är det enda säkra svaret att behandla den som brytande.
    expect(
      findBreakingStatements(
        `DO $$ BEGIN
           EXECUTE format('ALTER TABLE %I ADD CONSTRAINT x UNIQUE (a)', 'site_subscriptions');
         END $$;`,
        { exemptTables: ["site_subscriptions"] },
      ).map((f) => f.id),
    ).toEqual(["add-constraint"]);
  });

  it("låter inte dispensen öppna för fristående unika index", () => {
    // Repot kräver tabellinterna constraints. Att tabellen är ny ändrar inte
    // den regeln.
    expect(
      findBreakingStatements("CREATE UNIQUE INDEX t_uidx ON site_subscriptions (a);", {
        exemptTables: ["site_subscriptions"],
      }).map((f) => f.id),
    ).toEqual(["create-unique-index"]);
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
  const campaignFile = "add-kostnadsfri-campaign-entitlements.sql";
  const campaignSql = readFileSync(join("src", "lib", "db", "migrations", campaignFile), "utf8");
  const liveBeforeCampaign = {
    existingTables: ["generation_billings"],
    existingColumns: new Map([["generation_billings", ["id", "version_id"]]]),
    tablesWithWriteTriggers: [],
  };
  const classifyCampaign = (
    sql = campaignSql,
    metadata: Parameters<typeof classifyPendingMigrations>[1] = liveBeforeCampaign,
  ) =>
    classifyPendingMigrations([campaignFile], {
      migrationsDir: "fake",
      readFile: () => sql,
      ...metadata,
    })[0].findings;

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

  it("räknar en tabell som ny bara när den saknas i måldatabasen", () => {
    const files = {
      "create.sql": "CREATE TABLE IF NOT EXISTS fresh_table (id text PRIMARY KEY);",
      "upgrade.sql": "ALTER TABLE fresh_table ADD CONSTRAINT fresh_u UNIQUE (id, mode);",
    } as const;
    const read = (path: string) =>
      files[path.endsWith("create.sql") ? "create.sql" : "upgrade.sql"];
    const pending = ["create.sql", "upgrade.sql"];

    // Tabellen skapas av omgången och finns inte i databasen → additiv.
    expect(
      classifyPendingMigrations(pending, {
        migrationsDir: "fake",
        readFile: read,
        existingTables: ["users"],
      }).flatMap((entry) => entry.findings),
    ).toEqual([]);

    // Samma DDL mot en databas som redan har tabellen → brytande, eftersom den
    // kan innehålla rader och ha läsare i den gamla produktionskoden.
    expect(
      classifyPendingMigrations(pending, {
        migrationsDir: "fake",
        readFile: read,
        existingTables: ["users", "fresh_table"],
      }).flatMap((entry) => entry.findings.map((f) => f.id)),
    ).toEqual(["add-constraint"]);
  });

  it("klassar kampanjmigrationens nya nullable-kolumnconstraints som additiva", () => {
    // Produktionskoden som fortfarande kör på master lämnar båda kolumnerna
    // NULL. CHECK:en godtar exakt det läget och det partiella indexet utesluter
    // raden, medan katalogen bevisar att ingen trigger fyller dem åt skrivaren.
    expect(classifyCampaign()).toEqual([]);
    expect(
      classifyCampaign(campaignSql.replace("'initial', 'followup'", "'alpha', 'beta', 'gamma'")),
    ).toEqual([]);
  });

  it("failar stängt utan komplett kolumn- och triggermetadata", () => {
    expect(
      classifyCampaign(campaignSql, { existingTables: ["generation_billings"] }).map(
        (finding) => finding.id,
      ),
    ).toEqual(["add-constraint", "create-unique-index"]);
    expect(
      classifyCampaign(campaignSql, {
        existingTables: ["generation_billings"],
        existingColumns: new Map([["generation_billings", ["id"]]]),
      }).map((finding) => finding.id),
    ).toEqual(["add-constraint", "create-unique-index"]);
  });

  it("failar stängt när en proof-kolumn eller skrivtrigger redan finns live", () => {
    expect(
      classifyCampaign(campaignSql, {
        ...liveBeforeCampaign,
        existingColumns: new Map([["generation_billings", ["id", "campaign_entitlement_id"]]]),
      }).map((finding) => finding.id),
    ).toEqual(["add-constraint", "create-unique-index"]);
    expect(
      classifyCampaign(campaignSql, {
        ...liveBeforeCampaign,
        tablesWithWriteTriggers: ["generation_billings"],
      }).map((finding) => finding.id),
    ).toEqual(["add-constraint", "create-unique-index"]);
  });

  it("ger ingen CHECK-dispens när uttrycket refererar en gammal kolumn", () => {
    const unsafe = campaignSql
      .replace(
        "(campaign_entitlement_id IS NULL AND campaign_phase IS NULL)",
        "(version_id IS NULL AND campaign_phase IS NULL)",
      )
      .replace("campaign_entitlement_id IS NOT NULL", "version_id IS NOT NULL");
    expect(classifyCampaign(unsafe).map((finding) => finding.id)).toEqual(["add-constraint"]);

    const nullableFailure = campaignSql.replace("          AND campaign_phase IS NOT NULL\n", "");
    expect(classifyCampaign(nullableFailure).map((finding) => finding.id)).toEqual([
      "add-constraint",
    ]);
  });

  it("ogiltigförklarar beviset om batchen ändrar default eller skriver proof-kolumnen", () => {
    for (const mutation of [
      `ALTER TABLE public.generation_billings
         ALTER COLUMN campaign_entitlement_id SET DEFAULT 'seed';`,
      `ALTER TABLE ONLY public.generation_billings
         ALTER COLUMN campaign_phase SET DEFAULT 'seed';`,
      `ALTER TABLE IF EXISTS public.generation_billings
         ALTER COLUMN campaign_phase SET DEFAULT 'seed';`,
      "UPDATE ONLY public.generation_billings SET campaign_phase = 'initial';",
    ]) {
      const mutated = campaignSql.replace(
        "ADD COLUMN IF NOT EXISTS campaign_free_applied BOOLEAN NOT NULL DEFAULT FALSE;",
        `ADD COLUMN IF NOT EXISTS campaign_free_applied BOOLEAN NOT NULL DEFAULT FALSE;
         ${mutation}`,
      );
      expect(classifyCampaign(mutated).map((finding) => finding.id)).toEqual([
        "add-constraint",
        "create-unique-index",
      ]);
    }

    const withQuotedDefault = campaignSql.replace(
      "ADD COLUMN IF NOT EXISTS campaign_free_applied BOOLEAN NOT NULL DEFAULT FALSE;",
      `ADD COLUMN IF NOT EXISTS campaign_free_applied BOOLEAN NOT NULL DEFAULT FALSE;
       ALTER TABLE public."generation_billings"
         ALTER COLUMN "campaign_phase" SET DEFAULT 'bad';`,
    );
    expect(classifyCampaign(withQuotedDefault).map((finding) => finding.id)).toEqual([
      "add-constraint",
      "create-unique-index",
    ]);

    const withBackfill = campaignSql.replace(
      "ADD COLUMN IF NOT EXISTS campaign_free_applied BOOLEAN NOT NULL DEFAULT FALSE;",
      `ADD COLUMN IF NOT EXISTS campaign_free_applied BOOLEAN NOT NULL DEFAULT FALSE;
       UPDATE generation_billings SET campaign_phase = 'initial';`,
    );
    expect(classifyCampaign(withBackfill).map((finding) => finding.id)).toEqual([
      "add-constraint",
      "create-unique-index",
    ]);
  });

  it("kräver deklarationsordning och exakt statisk nullable TEXT-grammar", () => {
    const lateDeclaration = `
      ALTER TABLE public.generation_billings
        ADD CONSTRAINT generation_billings_campaign_phase_check
        CHECK (
          (campaign_entitlement_id IS NULL AND campaign_phase IS NULL)
          OR
          (
            campaign_entitlement_id IS NOT NULL
            AND campaign_phase IS NOT NULL
            AND campaign_phase IN ('initial', 'followup')
          )
        );
      ALTER TABLE public.generation_billings
        ADD COLUMN IF NOT EXISTS campaign_entitlement_id TEXT,
        ADD COLUMN IF NOT EXISTS campaign_phase TEXT;
    `;
    expect(classifyCampaign(lateDeclaration).map((finding) => finding.id)).toEqual([
      "add-constraint",
    ]);

    const nonNullDefault = campaignSql.replace(
      "ADD COLUMN IF NOT EXISTS campaign_entitlement_id TEXT,",
      "ADD COLUMN IF NOT EXISTS campaign_entitlement_id TEXT DEFAULT 'seed',",
    );
    expect(classifyCampaign(nonNullDefault).map((finding) => finding.id)).toEqual([
      "add-constraint",
      "create-unique-index",
    ]);
  });

  it("släpper inte uttryck, INCLUDE eller NULLS NOT DISTINCT genom unikhetsgrammatiken", () => {
    for (const unsafe of [
      campaignSql.replace(
        "ON public.generation_billings(campaign_entitlement_id, campaign_phase)",
        "ON public.generation_billings(lower(campaign_entitlement_id), campaign_phase)",
      ),
      campaignSql.replace(
        "WHERE campaign_entitlement_id IS NOT NULL;",
        "INCLUDE (version_id) WHERE campaign_entitlement_id IS NOT NULL;",
      ),
      campaignSql.replace(
        "ON public.generation_billings(campaign_entitlement_id, campaign_phase)\n  WHERE",
        "ON public.generation_billings(campaign_entitlement_id, campaign_phase) NULLS NOT DISTINCT\n  WHERE",
      ),
    ]) {
      expect(classifyCampaign(unsafe).map((finding) => finding.id)).toContain(
        "create-unique-index",
      );
    }
  });

  it("använder inte dynamisk SQL eller duplicerade deklarationer som kolumnbevis", () => {
    const dynamic = campaignSql.replace(
      "ADD COLUMN IF NOT EXISTS campaign_free_applied BOOLEAN NOT NULL DEFAULT FALSE;",
      `ADD COLUMN IF NOT EXISTS campaign_free_applied BOOLEAN NOT NULL DEFAULT FALSE;
       DO $body$ BEGIN EXECUTE 'SELECT 1'; END $body$;`,
    );
    expect(classifyCampaign(dynamic).map((finding) => finding.id)).toEqual([
      "add-constraint",
      "create-unique-index",
    ]);

    const duplicate = campaignSql.replace(
      "ADD COLUMN IF NOT EXISTS campaign_free_applied BOOLEAN NOT NULL DEFAULT FALSE;",
      `ADD COLUMN IF NOT EXISTS campaign_free_applied BOOLEAN NOT NULL DEFAULT FALSE,
       ADD COLUMN IF NOT EXISTS campaign_phase TEXT;`,
    );
    expect(classifyCampaign(duplicate).map((finding) => finding.id)).toEqual([
      "add-constraint",
      "create-unique-index",
    ]);

    const quotedPriorDuplicate = campaignSql.replace(
      "ALTER TABLE public.generation_billings",
      `ALTER TABLE public."generation_billings"
         ADD COLUMN IF NOT EXISTS "campaign_phase" TEXT DEFAULT 'bad';

       ALTER TABLE public.generation_billings`,
    );
    expect(classifyCampaign(quotedPriorDuplicate).map((finding) => finding.id)).toEqual([
      "add-constraint",
      "create-unique-index",
    ]);
  });

  it("kräver public-kvalificerade proof-mål oavsett search_path", () => {
    const shadowable = `SET LOCAL search_path TO shadow, public;
${campaignSql.replaceAll("public.generation_billings", "generation_billings")}`;
    expect(classifyCampaign(shadowable).map((finding) => finding.id)).toEqual([
      "add-constraint",
      "create-unique-index",
    ]);
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

describe("parseCreatedTables", () => {
  it("läser tabellerna en fil skapar, oavsett IF NOT EXISTS och schemaprefix", () => {
    expect(
      parseCreatedTables(`
        CREATE TABLE IF NOT EXISTS billing_customers (id text PRIMARY KEY);
        CREATE TABLE public.billing_jobs (id text PRIMARY KEY);
        -- CREATE TABLE kommenterad_bort (id text);
      `),
    ).toEqual(new Set(["billing_customers", "billing_jobs"]));
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
      "add-constraint",
      "add-unique",
      "add-primary-key",
      "add-foreign-key",
      "add-column-unique",
      "create-unique-index",
    ]);
  });
});

describe("CI SSL wiring", () => {
  it("uses the shared pg SSL owner so sslmode=require cannot override rejectUnauthorized", () => {
    const source = readFileSync(join("scripts", "db", "check-additive-migrations.mjs"), "utf8");
    expect(source).toContain("connectionStringForPg(connectionString)");
    expect(source).toContain("resolveSslConfig(connectionString)");
    expect(source).not.toMatch(/ssl:\s*\{\s*rejectUnauthorized:/u);
  });

  it("läser alla INSERT/UPDATE-triggers, även AFTER-triggers", () => {
    const source = readFileSync(join("scripts", "db", "check-additive-migrations.mjs"), "utf8");
    expect(source).toContain("FROM information_schema.triggers");
    expect(source).toContain("event_manipulation IN ('INSERT', 'UPDATE')");
    expect(source).not.toMatch(/action_timing\s*=\s*'BEFORE'/u);
  });
});
