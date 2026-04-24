/**
 * Schema-drift-test mellan fyra källor:
 *   1) `src/lib/db/schema.ts`                    (Drizzle-typmetadata)
 *   2) `scripts/db/db-init.mjs`                  (CREATE TABLE/INDEX runtime)
 *   3) `scripts/db/add-performance-indexes.mjs`  (perf-migration)
 *   4) `src/lib/db/migrations/*.sql`             (legacy SQL-migrations som
 *                                                 db-init.mjs kör in-line)
 *
 * Idag är (1) och (2)+(3)+(4) separata sources of truth som måste synkas
 * manuellt. Detta test fångar drift INNAN den når DB:n.
 *
 * Testen är medvetet **icke-strikt** på vissa punkter:
 *   - Tillåter att (2) har FLER index än (1) — t.ex. `idx_gen_telemetry_chat`
 *     som är en alternativ namnsättning för `idx_generation_telemetry_chat`.
 *     (Dedupe-aware health-check hanterar det.)
 *   - Tillåter att (3) använder snake_case-kolumnnamn som inte matchar
 *     Drizzle-egendomsnamn (camelCase) — vi parsar SQL-kolumnerna direkt.
 *
 * Vad testen **fångar** (verkliga problem):
 *   - Index deklareras i `schema.ts` men finns varken i (2) eller (3) →
 *     produktionsmiljön får aldrig indexet (db:init kör bara CREATE INDEX
 *     från (2); Drizzle-deklarationen är ren typmetadata).
 *   - Tabell finns i `schema.ts` men inte i `db-init.mjs` → tabellen skapas
 *     aldrig på nya miljöer.
 *
 * Långbänk-uppföljning 2026-04-24.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCHEMA_TS = join(REPO_ROOT, "src/lib/db/schema.ts");
const DB_INIT = join(REPO_ROOT, "scripts/db/db-init.mjs");
const PERF_INDEXES = join(REPO_ROOT, "scripts/db/add-performance-indexes.mjs");
const SQL_MIGRATIONS_DIR = join(REPO_ROOT, "src/lib/db/migrations");

function readFile(p: string): string {
  return readFileSync(p, "utf8");
}

function readSqlMigrationsCombined(): string {
  if (!existsSync(SQL_MIGRATIONS_DIR)) return "";
  const files = readdirSync(SQL_MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  return files.map((f) => readFile(join(SQL_MIGRATIONS_DIR, f))).join("\n\n");
}

/**
 * Plocka ut alla `pgTable("name", ...)` som deklareras i schema.ts.
 * Returnerar tabellnamn (snake_case som det skickas till Postgres).
 */
function parseDrizzleTables(source: string): Set<string> {
  const tables = new Set<string>();
  // Matchar både `pgTable("name", { ... })` och `pgTable("name", { ... }, (table) => ...)`
  const re = /pgTable\(\s*["']([a-z_][a-z0-9_]*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    tables.add(m[1]);
  }
  return tables;
}

/**
 * Plocka ut alla CREATE TABLE-namn från db-init.mjs.
 */
function parseCreateTables(source: string): Set<string> {
  const tables = new Set<string>();
  const re = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    tables.add(m[1]);
  }
  return tables;
}

/**
 * Plocka ut alla CREATE INDEX-namn från en mjs-källa. Inkluderar både
 * UNIQUE och vanliga, både inline-strängar och template-literals, och
 * både obekvoterade (`name`) och dubbel-citerade (`"name"`) namn — det
 * senare används i SQL-migrations som följer Postgres-konventionen.
 */
function parseCreateIndexes(source: string): Set<string> {
  const indexes = new Set<string>();
  const re =
    /CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF NOT EXISTS)?\s+(?:"([a-z_][a-z0-9_]*)"|([a-z_][a-z0-9_]*))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    indexes.add(m[1] || m[2]);
  }
  return indexes;
}

/**
 * Plocka ut alla `index("name")` och `uniqueIndex("name")`-anrop från
 * Drizzle-schemat.
 */
function parseDrizzleIndexes(source: string): Set<string> {
  const indexes = new Set<string>();
  const re = /\b(?:index|uniqueIndex)\(\s*["']([a-z_][a-z0-9_]*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    indexes.add(m[1]);
  }
  return indexes;
}

describe("schema-drift mellan schema.ts, db-init.mjs och add-performance-indexes.mjs", () => {
  const schemaSrc = readFile(SCHEMA_TS);
  const dbInitSrc = readFile(DB_INIT);
  const perfSrc = readFile(PERF_INDEXES);
  const sqlMigrationsSrc = readSqlMigrationsCombined();

  const drizzleTables = parseDrizzleTables(schemaSrc);
  const createdTables = new Set([
    ...parseCreateTables(dbInitSrc),
    ...parseCreateTables(sqlMigrationsSrc),
  ]);
  const drizzleIndexes = parseDrizzleIndexes(schemaSrc);
  const dbInitIndexes = parseCreateIndexes(dbInitSrc);
  const perfIndexes = parseCreateIndexes(perfSrc);
  const sqlMigrationsIndexes = parseCreateIndexes(sqlMigrationsSrc);
  const allRuntimeIndexes = new Set([
    ...dbInitIndexes,
    ...perfIndexes,
    ...sqlMigrationsIndexes,
  ]);

  it("varje pgTable() i schema.ts har en motsvarande CREATE TABLE i db-init.mjs", () => {
    const missing = [...drizzleTables].filter((t) => !createdTables.has(t));
    if (missing.length > 0) {
      throw new Error(
        `Tabeller i schema.ts saknar CREATE TABLE i scripts/db/db-init.mjs:\n  - ${missing.join("\n  - ")}\n\n` +
          `Lägg till motsvarande CREATE TABLE-sats i db-init.mjs (se befintliga som mall) ` +
          `så att nya miljöer får tabellen vid 'npm run db:init'.`,
      );
    }
  });

  it("varje index() / uniqueIndex() i schema.ts skapas faktiskt av minst en runtime-källa", () => {
    // Index som INTE finns i någon av (db-init.mjs, add-performance-indexes.mjs).
    // Dvs Drizzle-deklarationen är pratiga TS-typer, men inget kommer skapa
    // det i en faktisk Postgres-databas. Det är bedrägligt.
    const missing = [...drizzleIndexes].filter((i) => !allRuntimeIndexes.has(i));
    if (missing.length > 0) {
      throw new Error(
        `Index i schema.ts saknar CREATE INDEX i runtime-källa (db-init.mjs eller add-performance-indexes.mjs):\n  - ${missing.join("\n  - ")}\n\n` +
          `Antingen lägg till i scripts/db/add-performance-indexes.mjs (rekommenderat — körs idempotent ` +
          `via predev + backoffice-knapp) eller i db-init.mjs (körs vid första uppsättning).`,
      );
    }
  });

  it("schema.ts och db-init.mjs har minst samma kärntabeller (sanity-check, inte exakt match)", () => {
    // Tillåt att db-init.mjs har FLER tabeller (legacy) och att schema.ts kan
    // ha några fler (ny-deklarerade som inte fått CREATE TABLE än fångas av
    // testet ovan). Det här är en sanity-check att vi inte tappat båda.
    expect(drizzleTables.size).toBeGreaterThan(20);
    expect(createdTables.size).toBeGreaterThan(20);
  });

  it("perf-indexes-skriptet har minst de hot-path-index vi vet vi behöver", () => {
    // Regression-skydd för långbänk 2026-04-24. Om någon råkar ta bort
    // ett av dessa från `scripts/db/add-performance-indexes.mjs` så fångar
    // testen det innan det når prod.
    const required = [
      "idx_engine_messages_chat_created",
      "idx_engine_versions_chat_created",
      "idx_engine_generation_logs_chat_created",
    ];
    const missing = required.filter((r) => !perfIndexes.has(r));
    expect(missing, `Saknade hot-path-index i add-performance-indexes.mjs`).toEqual([]);
  });
});
