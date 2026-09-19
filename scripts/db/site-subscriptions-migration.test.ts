import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  classifyPendingMigrations,
  findBreakingStatements,
  maskSqlComments,
} from "./check-additive-migrations.mjs";
import { MIGRATION_ORDER } from "./migration-order.mjs";

const REPO_ROOT = process.cwd();
const MIGRATION_FILE = "add-site-subscriptions.sql";
const UPGRADE_FILE = "upgrade-site-subscriptions-composite-keys.sql";

const migration = readFileSync(
  join(REPO_ROOT, "src/lib/db/migrations", MIGRATION_FILE),
  "utf8",
);
const upgrade = readFileSync(join(REPO_ROOT, "src/lib/db/migrations", UPGRADE_FILE), "utf8");
const dbInit = readFileSync(join(REPO_ROOT, "scripts/db/db-init.mjs"), "utf8");
const dbHealth = readFileSync(join(REPO_ROOT, "scripts/db/db-health-check.mjs"), "utf8");
const pyDbTest = readFileSync(join(REPO_ROOT, "scripts/db/pydatabastest.py"), "utf8");
const schemaTs = readFileSync(join(REPO_ROOT, "src/lib/db/schema.ts"), "utf8");

const D1_TABLES = [
  "billing_customers",
  "site_subscriptions",
  "subscription_credit_grants",
  "billing_jobs",
] as const;

describe("D1-migrationen är additiv och registrerad", () => {
  it("passerar repots egen additiv-grind", () => {
    // Samma klassificerare som `npm run db:migrate:additive-check`. Preview
    // delar databas med en produktion som kör gammal kod, så en framtida
    // redigering av filen får inte smyga in brytande DDL.
    expect(findBreakingStatements(migration)).toEqual([]);
  });

  it("skapar varje tabell idempotent", () => {
    for (const table of D1_TABLES) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
    }
    // Fristående unika index är brytande enligt grinden; unikheten bor därför
    // i tabellkroppen, där den föds tom tillsammans med tabellen.
    expect(migration).not.toMatch(/CREATE\s+UNIQUE\s+INDEX/iu);
    for (const statement of migration.match(/CREATE\s+INDEX[^\n]*/giu) ?? []) {
      expect(statement).toContain("IF NOT EXISTS");
    }
  });

  it("ligger efter tabellerna den har främmande nycklar mot", () => {
    const position = MIGRATION_ORDER.indexOf(MIGRATION_FILE);
    expect(position, `${MIGRATION_FILE} saknas i MIGRATION_ORDER`).toBeGreaterThanOrEqual(0);
    // users, app_projects och transactions skapas av db-init innan
    // migrationerna körs; det som MÅSTE ligga före i ledgern är
    // transactions idempotensnyckel, som periodgranten är designad mot.
    expect(position).toBeGreaterThan(MIGRATION_ORDER.indexOf("add-transactions-idempotency-key.sql"));
  });

  it("stänger anon och authenticated ute, inte bara via RLS", () => {
    // Supabases default-privilegier ger annars klientrollerna rättigheter på
    // nya publika tabeller, och en migration-only-deploy kör aldrig db-init:s
    // separata RLS-pass.
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC");
    expect(migration).toContain("FROM anon");
    expect(migration).toContain("FROM authenticated");
    expect(migration).toContain("TO postgres, service_role");
  });
});

describe("D1-uppgraderingen når tabeller som redan finns", () => {
  /** Bara körbar DDL: prosan i filen ska inte kunna uppfylla ett krav här. */
  const upgradeDdl = maskSqlComments(upgrade);

  /** Namn + form för varje namngiven CONSTRAINT i en CREATE TABLE-kropp. */
  function declaredConstraints(source: string): string[] {
    return D1_TABLES.flatMap((table) => [
      ...createTableBody(table, source).matchAll(/CONSTRAINT\s+([a-z_][a-z0-9_]*)\s/gu),
    ].map((match) => match[1]));
  }

  it("lägger till varje namngiven constraint som ägarfilen deklarerar", () => {
    // Det här är hela poängen med filen: `CREATE TABLE IF NOT EXISTS` rör inte
    // en tabell som redan finns, så utan en ADD CONSTRAINT per deklaration
    // skulle en dev- eller preview-databas som fick den FÖRSTA versionen sakna
    // garantierna för alltid — utan att något test märkte det.
    const missing = declaredConstraints(migration).filter(
      (name) => !new RegExp(`ADD\\s+CONSTRAINT\\s+${name}\\b`, "u").test(upgradeDdl),
    );
    expect(missing, "constraints som saknar uppgraderingsväg").toEqual([]);
  });

  it("är idempotent per constraint i stället för per fil", () => {
    // Ett enda block för alla ALTER hade avbrutits av den första som redan
    // fanns, och resten hade tyst hoppats över.
    const addCount = upgradeDdl.match(/ADD\s+CONSTRAINT/gu)?.length ?? 0;
    const guardCount = upgradeDdl.match(/EXCEPTION WHEN duplicate_object OR duplicate_table/gu)
      ?.length ?? 0;
    expect(addCount).toBeGreaterThan(0);
    expect(guardCount).toBe(addCount);
  });

  it("byter ut de FK-former som första versionen fick fel, och bara dem", () => {
    // CASCADE mot users hade låtit en adminrensning ta bokföringen; de
    // enkolumniga länkarna kontrollerade bara att id:t fanns.
    for (const legacy of [
      "billing_customers_user_id_fkey",
      "site_subscriptions_user_id_fkey",
      "site_subscriptions_billing_customer_id_fkey",
      "subscription_credit_grants_subscription_id_fkey",
      "subscription_credit_grants_user_id_fkey",
      "billing_jobs_subscription_id_fkey",
    ]) {
      expect(upgradeDdl, `${legacy} saknar uppgradering`).toMatch(
        new RegExp(`DROP\\s+CONSTRAINT(?:\\s+IF\\s+EXISTS)?\\s+${legacy}\\b`, "u"),
      );
    }
    // Projektlänken var RESTRICT redan från början och ska inte röras.
    expect(upgradeDdl).not.toContain("site_subscriptions_project_id_fkey");
    expect(upgradeDdl).not.toMatch(/\bDROP\s+TABLE\b/iu);
    expect(upgradeDdl).not.toMatch(/\bDROP\s+COLUMN\b/iu);
  });

  it("ligger direkt efter ägarfilen i MIGRATION_ORDER", () => {
    expect(MIGRATION_ORDER.indexOf(UPGRADE_FILE)).toBe(
      MIGRATION_ORDER.indexOf(MIGRATION_FILE) + 1,
    );
  });

  it("är additiv mot en databas som ännu inte har tabellerna", () => {
    // Den automatiska preview-vägen träffar prod-Postgres, där ingen av de fyra
    // tabellerna finns än: samma omgång skapar dem i filen före. Då kan en
    // constraint varken ogiltigförklara en rad eller en INSERT från gammal kod.
    const findings = classifyPendingMigrations([MIGRATION_FILE, UPGRADE_FILE], {
      existingTables: ["users", "app_projects", "transactions"],
    });
    expect(findings.flatMap((entry) => entry.findings)).toEqual([]);
  });

  it("klassas som brytande om tabellerna redan finns i måldatabasen", () => {
    // Grinden är inte avstängd — den vet bara skillnaden. En databas som redan
    // har tabellerna får inte uppgraderas av den automatiska preview-vägen.
    const findings = classifyPendingMigrations([MIGRATION_FILE, UPGRADE_FILE], {
      existingTables: ["users", "app_projects", "transactions", ...D1_TABLES],
    });
    expect(findings.find((entry) => entry.filename === UPGRADE_FILE)?.findings.length).
      toBeGreaterThan(0);
  });
});

describe("D1-schemat är samma sanning i alla ägare", () => {
  it("har samma tabellkroppar i db-init som i migrationen", () => {
    // db:init och db:migrate är två ingångar till samma schema. Glider de
    // isär får en färsk databas en annan form än en migrerad.
    for (const table of D1_TABLES) {
      expect(createTableBody(table, dbInit), `db-init avviker för ${table}`).toBe(
        createTableBody(table, migration),
      );
    }
  });

  it("är deklarerat i Drizzle med lägesfältet på varje tabell", () => {
    for (const table of D1_TABLES) {
      expect(schemaTs).toContain(`pgTable(\n  "${table}"`);
    }
    expect(schemaTs).toContain('export type BillingMode = "test" | "live";');
    const billingModeColumns =
      schemaTs.match(/billing_mode: text\("billing_mode"\)\.\$type<BillingMode>\(\)\.notNull\(\)/gu) ??
      [];
    // D1-tabellerna + D2:s event-inbox. Räkna dem isär så en ny tabell
    // inte kan gömma sig bakom samma totalsumma.
    expect(billingModeColumns.length).toBe(D1_TABLES.length + 1);
    expect(schemaTs).toContain('pgTable(\n  "stripe_billing_events"');
    expect(drizzleTableBody("stripe_billing_events", schemaTs)).toContain(
      'billing_mode: text("billing_mode").$type<BillingMode>().notNull()',
    );
    for (const table of D1_TABLES) {
      expect(drizzleTableBody(table, schemaTs)).toContain(
        'billing_mode: text("billing_mode").$type<BillingMode>().notNull()',
      );
    }
  });

  it("är synligt för operatören i databashälsan", () => {
    for (const table of D1_TABLES) {
      expect(dbHealth).toContain(`"${table}"`);
    }
  });

  it("är klassat i prod-sync-grinden som rad-behållande", () => {
    // EMPTY skulle falsk-faila grinden så fort D2 skriver en enda rad, och en
    // oklassad tabell failar som "extra table".
    const group = (name: string) =>
      pyDbTest.match(new RegExp(`${name}: Tuple\\[str, \\.\\.\\.\\] = \\(([\\s\\S]*?)\\n\\)`, "u"))?.[1] ??
      "";
    const empty = group("EMPTY_TABLES");
    const preserved = group("PRESERVED_TABLES");
    const cache = group("CACHE_TABLES");
    for (const table of D1_TABLES) {
      expect(empty, `${table} får inte kräva 0 rader`).not.toContain(`"${table}"`);
      expect(`${preserved}${cache}`, `${table} är oklassad`).toContain(`"${table}"`);
    }
  });
});

describe("D1-schemat förblir additivt; D2-ägare får läsa och skriva", () => {
  /**
   * Bevarandespärren MÅSTE kunna räkna raderna: adminrensningarna raderar flera
   * tabeller i tur och ordning, så utan en fråga före den första DELETE:n kommer
   * databasens RESTRICT först när halva miljön är borta. Den får läsa — aldrig
   * skriva. Nästa test håller den gränsen.
   */
  const RETENTION_GUARD = join("src", "lib", "db", "billing-retention-guard.ts");

  /** Checkout, webhook, reconcile, konto, policy och deras följdytor. */
  const D2_OWNER_MARKERS = [
    join("src", "lib", "billing", "site-subscription-"),
    join("src", "lib", "billing", "stripe-webhook-dispatch"),
    join("src", "lib", "db", "services", "site-subscriptions"),
    join("src", "lib", "konto"),
    join("src", "app", "konto"),
    join("src", "app", "api", "konto"),
    join("src", "app", "api", "stripe", "site-subscription"),
    join("src", "app", "api", "stripe", "webhook"),
  ];

  function isD2Owner(path: string): boolean {
    return D2_OWNER_MARKERS.some((marker) => path.includes(marker));
  }

  /** Alla källfiler under src/ utom schema-ägaren och migrationerna. */
  function appSources(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
        } else if ([".ts", ".tsx", ".js", ".mjs", ".sql"].includes(extname(entry.name))) {
          out.push(path);
        }
      }
    };
    walk(join(REPO_ROOT, "src"));
    return out.filter(
      (path) =>
        !path.endsWith(join("src", "lib", "db", "schema.ts")) &&
        !path.endsWith(RETENTION_GUARD) &&
        !path.includes(join("src", "lib", "db", "migrations")),
    );
  }

  it("låter bara kända D2-ägare nämna abonnemangstabellerna", () => {
    // D1 är fortfarande additivt schema. D2-ägare får läsa och skriva.
    // En ny fil utanför allowlist som rör tabellerna failar här.
    const offenders = appSources().filter((path) => {
      if (isD2Owner(path)) return false;
      const source = readFileSync(path, "utf8");
      return D1_TABLES.some(
        (table) => source.includes(table) || source.includes(toCamel(table)),
      );
    });
    expect(offenders).toEqual([]);
  });

  it("låter bevarandespärren räkna rader men aldrig skriva dem", () => {
    const guard = readFileSync(join(REPO_ROOT, RETENTION_GUARD), "utf8");
    // Bara SELECT. En INSERT/UPDATE/DELETE här vore skrivflödet smuget in i spärren.
    expect(guard).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/iu);
    expect(guard).not.toMatch(/db\.(insert|update|delete)\(/u);
    expect(guard).toContain("SELECT count(*) FROM site_subscriptions");
  });
});

function toCamel(snake: string): string {
  return snake.replace(/_([a-z])/gu, (_match, letter: string) => letter.toUpperCase());
}

/** Drizzle-deklarationen för en namngiven tabell, fram till nästa `pgTable`. */
function drizzleTableBody(table: string, source: string): string {
  const marker = `pgTable(\n  "${table}"`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`hittade ingen pgTable för ${table}`);
  const next = source.indexOf("pgTable(", start + marker.length);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

/**
 * Kolumn- och constraintlistan för `table`, normaliserad: radkommentarer bort
 * och blanksteg kollapsade, så jämförelsen gäller schemat och inte prosan.
 * Parenteserna räknas i stället för att matchas med regex — kroppen innehåller
 * nästlade uttryck (CHECK, CASE, GENERATED) som en icke-girig regex klipper av.
 */
function createTableBody(table: string, source: string): string {
  const marker = `CREATE TABLE IF NOT EXISTS ${table} (`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`hittade ingen CREATE TABLE för ${table}`);

  let depth = 0;
  let index = start + marker.length - 1;
  for (; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error(`obalanserad CREATE TABLE för ${table}`);

  return source
    .slice(start + marker.length, index)
    .replace(/--[^\n]*/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}
