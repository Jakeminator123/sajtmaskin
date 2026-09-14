import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { findBreakingStatements } from "./check-additive-migrations.mjs";
import { MIGRATION_ORDER } from "./migration-order.mjs";

const REPO_ROOT = process.cwd();
const MIGRATION_FILE = "add-site-subscriptions.sql";

const migration = readFileSync(
  join(REPO_ROOT, "src/lib/db/migrations", MIGRATION_FILE),
  "utf8",
);
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
    expect(
      schemaTs.match(/billing_mode: text\("billing_mode"\)\.\$type<BillingMode>\(\)\.notNull\(\)/gu)
        ?.length,
    ).toBe(D1_TABLES.length);
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

describe("D1 aktiverar inget kundflöde", () => {
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
        !path.includes(join("src", "lib", "db", "migrations")),
    );
  }

  it("har ingen läsare eller skrivare av abonnemangstabellerna ännu", () => {
    // D1 är schema. Checkout, webhook, portallänk och avstämning ägs av D2, och
    // den här grinden gör det synligt om något smyger in i samma etapp.
    const offenders = appSources().filter((path) => {
      const source = readFileSync(path, "utf8");
      return D1_TABLES.some(
        (table) => source.includes(table) || source.includes(toCamel(table)),
      );
    });
    expect(offenders).toEqual([]);
  });
});

function toCamel(snake: string): string {
  return snake.replace(/_([a-z])/gu, (_match, letter: string) => letter.toUpperCase());
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
