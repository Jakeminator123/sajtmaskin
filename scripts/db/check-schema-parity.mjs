#!/usr/bin/env node
/**
 * Live schema-parity gate: DEV-Supabase vs PROD-Supabase.
 *
 * Compares the two LIVE databases object-for-object (public schema): tables,
 * columns (type/nullability/default), indexes and constraints. Exits non-zero
 * on ANY difference, listing exactly which side is missing what. This is the
 * complement to `db:schema-drift` (static, repo-internal) and
 * `db:migrate:check` (ledger only): neither of those can see a column added
 * directly in the Supabase dashboard, or an apply that half-failed — this
 * gate can, because it asks the databases themselves.
 *
 * Strictly read-only: only SELECTs from information_schema / pg_catalog.
 * Output is sanitized (hosts + object names, never credentials).
 *
 * Connection resolution (per side):
 *   dev : env POSTGRES_URL_DEV,  else .env.local
 *   prod: env POSTGRES_URL_PROD, else .env.vercel.production.pulled
 *
 * Each URL is identity-checked against config/db-targets.json before any
 * query — a parity check against the WRONG database would be worse than no
 * check at all.
 *
 * Skip semantics mirror the sibling gates: NO connection on either side →
 * WARN + exit 0 (forks / no-secret CI). Exactly one side, or --require with
 * anything missing → hard exit 1 (false-green protection on the main repo).
 *
 * Usage:
 *   node scripts/db/check-schema-parity.mjs
 *   node scripts/db/check-schema-parity.mjs --require
 *   node scripts/db/check-schema-parity.mjs --json
 */
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { Pool } from "pg";
import { parse as parseEnvFile } from "dotenv";
import { extractSupabaseProjectRef, loadDbTargets } from "./check-db-env-target.mjs";
import { normalizeEnvUrl, summarizeConnectionString, CONNECTION_KEYS } from "./db-target-guard.mjs";
import { resolveSslConfig } from "./db-ssl.mjs";

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in check-schema-parity.test.ts)
// ---------------------------------------------------------------------------

/**
 * Collapse a SQL definition (indexdef / constraintdef / column default) to a
 * whitespace-insensitive comparable form. Case is preserved: identifiers are
 * case-sensitive-ish in the output of pg_get_*def and both sides come from
 * the same DDL, so differing case IS a real difference.
 *
 * @param {string | null | undefined} def
 * @returns {string | null}
 */
export function normalizeSqlDef(def) {
  if (def === null || def === undefined) return null;
  const collapsed = String(def).replace(/\s+/g, " ").trim().replace(/;$/, "");
  return collapsed === "" ? null : collapsed;
}

/**
 * One comparable column shape from an information_schema.columns row.
 *
 * @param {Record<string, unknown>} row
 * @returns {string} stable, human-readable signature
 */
export function columnSignature(row) {
  const parts = [
    `type=${row.data_type}`,
    `udt=${row.udt_name}`,
    `nullable=${row.is_nullable}`,
    `default=${normalizeSqlDef(row.column_default) ?? "-"}`,
  ];
  if (row.character_maximum_length !== null && row.character_maximum_length !== undefined) {
    parts.push(`maxlen=${row.character_maximum_length}`);
  }
  if (row.numeric_precision !== null && row.numeric_precision !== undefined) {
    parts.push(`precision=${row.numeric_precision}`);
  }
  if (row.numeric_scale !== null && row.numeric_scale !== undefined) {
    parts.push(`scale=${row.numeric_scale}`);
  }
  return parts.join(" ");
}

/**
 * @typedef {{
 *   tables: Set<string>,
 *   columns: Map<string, string>,      // "table.column" -> signature
 *   indexes: Map<string, string>,      // index name -> normalized indexdef
 *   constraints: Map<string, string>,  // "table.constraint" -> normalized def
 * }} SchemaModel
 */

/**
 * Diff two schema models. Returns findings; empty array = parity.
 *
 * @param {SchemaModel} dev
 * @param {SchemaModel} prod
 * @returns {Array<{ kind: string, object: string, detail: string }>}
 */
export function diffSchemas(dev, prod) {
  const findings = [];

  const setDiff = (kind, left, right, leftLabel, rightLabel) => {
    for (const name of [...left].sort()) {
      if (!right.has(name)) {
        findings.push({ kind, object: name, detail: `finns i ${leftLabel} men saknas i ${rightLabel}` });
      }
    }
  };

  setDiff("table", dev.tables, prod.tables, "DEV", "PROD");
  setDiff("table", prod.tables, dev.tables, "PROD", "DEV");

  const mapDiff = (kind, devMap, prodMap) => {
    const keys = new Set([...devMap.keys(), ...prodMap.keys()]);
    for (const key of [...keys].sort()) {
      // Objects belonging to a table that only exists on one side are already
      // reported as a table finding — repeating every column/index of that
      // table would drown the real signal.
      const table = key.split(".")[0];
      const tableOnlyOneSide = dev.tables.has(table) !== prod.tables.has(table);
      if (kind !== "index" && tableOnlyOneSide) continue;

      const inDev = devMap.get(key);
      const inProd = prodMap.get(key);
      if (inDev === undefined) {
        findings.push({ kind, object: key, detail: "finns i PROD men saknas i DEV" });
      } else if (inProd === undefined) {
        findings.push({ kind, object: key, detail: "finns i DEV men saknas i PROD" });
      } else if (inDev !== inProd) {
        findings.push({ kind, object: key, detail: `skiljer sig — DEV: ${inDev} · PROD: ${inProd}` });
      }
    }
  };

  mapDiff("column", dev.columns, prod.columns);
  mapDiff("index", dev.indexes, prod.indexes);
  mapDiff("constraint", dev.constraints, prod.constraints);

  return findings;
}

/**
 * First usable Postgres URL from a parsed env-file object, in the same key
 * precedence as the runtime resolver.
 *
 * @param {Record<string, string>} parsed
 * @returns {string | undefined}
 */
export function connectionFromParsedEnv(parsed) {
  for (const key of CONNECTION_KEYS) {
    const value = normalizeEnvUrl(parsed[key]);
    if (value) return value;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Connection resolution + identity guard
// ---------------------------------------------------------------------------

function readEnvFileConnection(filePath) {
  if (!existsSync(filePath)) return undefined;
  try {
    return connectionFromParsedEnv(parseEnvFile(readFileSync(filePath, "utf8")));
  } catch {
    return undefined;
  }
}

/**
 * @param {"dev" | "prod"} side
 * @returns {{ url: string, source: string } | null}
 */
function resolveSideConnection(side) {
  const envKey = side === "dev" ? "POSTGRES_URL_DEV" : "POSTGRES_URL_PROD";
  const fromEnv = normalizeEnvUrl(process.env[envKey]);
  if (fromEnv) return { url: fromEnv, source: envKey };

  const file = side === "dev" ? ".env.local" : ".env.vercel.production.pulled";
  const fromFile = readEnvFileConnection(file);
  if (fromFile) return { url: fromFile, source: file };

  return null;
}

/**
 * Hard identity guard: the URL for a side MUST be the registered Supabase
 * project for that side. A local/unknown Postgres is refused too — parity
 * against anything but the real dev/prod pair proves nothing.
 */
function assertSideIdentity(side, url, targets) {
  const ref = extractSupabaseProjectRef(url)?.ref ?? null;
  const expected = targets[side].projectRef;
  if (ref === expected) return;
  const summary = summarizeConnectionString(url);
  throw new Error(
    `[db:schema-parity] ${side.toUpperCase()}-URL:en pekar inte på det registrerade ${side}-projektet ` +
      `(${expected}, ${targets[side].region}) — fick ${summary} (ref=${ref ?? "-"}). ` +
      `Kontrollera källan (POSTGRES_URL_${side.toUpperCase()} / env-fil) mot config/db-targets.json.`,
  );
}

// ---------------------------------------------------------------------------
// Introspection (read-only)
// ---------------------------------------------------------------------------

/**
 * @param {import("pg").Pool} pool
 * @returns {Promise<SchemaModel>}
 */
async function introspect(pool) {
  const [tablesRes, columnsRes, indexesRes, constraintsRes] = await Promise.all([
    pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    ),
    pool.query(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
              character_maximum_length, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_schema = 'public'`,
    ),
    pool.query(
      `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    ),
    pool.query(
      `SELECT rel.relname AS table_name, con.conname AS constraint_name,
              pg_get_constraintdef(con.oid) AS definition
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       WHERE nsp.nspname = 'public'`,
    ),
  ]);

  const tables = new Set(tablesRes.rows.map((r) => r.table_name));

  const columns = new Map();
  for (const row of columnsRes.rows) {
    if (!tables.has(row.table_name)) continue;
    columns.set(`${row.table_name}.${row.column_name}`, columnSignature(row));
  }

  const indexes = new Map();
  for (const row of indexesRes.rows) {
    if (!tables.has(row.tablename)) continue;
    indexes.set(row.indexname, normalizeSqlDef(row.indexdef) ?? "");
  }

  const constraints = new Map();
  for (const row of constraintsRes.rows) {
    if (!tables.has(row.table_name)) continue;
    constraints.set(`${row.table_name}.${row.constraint_name}`, normalizeSqlDef(row.definition) ?? "");
  }

  return { tables, columns, indexes, constraints };
}

function createPool(url, { allowInsecureSsl = false } = {}) {
  const clean = (() => {
    try {
      const u = new URL(url);
      u.searchParams.delete("sslmode");
      u.searchParams.delete("supa");
      return u.toString();
    } catch {
      return url;
    }
  })();
  return new Pool({
    connectionString: clean,
    ssl: resolveSslConfig(url, { allowInsecureSsl }),
    max: 2,
    connectionTimeoutMillis: 15_000,
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const required = args.includes("--require");
  // Both sides are identity-guarded to the registered Supabase projects below,
  // and Supabase presents a self-signed chain — same trade-off as
  // db:migrate:check:prod, which also bakes this flag into its npm script.
  const allowInsecureSsl = args.includes("--allow-insecure-ssl");

  const dev = resolveSideConnection("dev");
  const prod = resolveSideConnection("prod");

  if (!dev && !prod) {
    if (required) {
      console.error(
        "[db:schema-parity] --require: ingen databas-anslutning för någon sida " +
          "(POSTGRES_URL_DEV/POSTGRES_URL_PROD eller env-filer saknas).",
      );
      process.exit(1);
    }
    console.warn("[db:schema-parity] Ingen databas-anslutning för någon sida — SKIP (exit 0).");
    process.exit(0);
  }

  if (!dev || !prod) {
    const missing = !dev ? "dev (POSTGRES_URL_DEV / .env.local)" : "prod (POSTGRES_URL_PROD / .env.vercel.production.pulled)";
    console.error(
      `[db:schema-parity] Bara ena sidan är konfigurerad — saknar ${missing}. ` +
        "Paritet kan inte bevisas med en sida; vägrar falsk-grön skip.",
    );
    process.exit(1);
  }

  const targets = loadDbTargets();
  assertSideIdentity("dev", dev.url, targets);
  assertSideIdentity("prod", prod.url, targets);

  const devLabel = summarizeConnectionString(dev.url);
  const prodLabel = summarizeConnectionString(prod.url);
  console.log(`[db:schema-parity] DEV  ← ${dev.source}: ${devLabel}`);
  console.log(`[db:schema-parity] PROD ← ${prod.source}: ${prodLabel}`);

  const devPool = createPool(dev.url, { allowInsecureSsl });
  const prodPool = createPool(prod.url, { allowInsecureSsl });
  try {
    const [devSchema, prodSchema] = await Promise.all([introspect(devPool), introspect(prodPool)]);
    const findings = diffSchemas(devSchema, prodSchema);

    if (asJson) {
      console.log(
        JSON.stringify({
          ok: findings.length === 0,
          dev: { source: dev.source, tables: devSchema.tables.size },
          prod: { source: prod.source, tables: prodSchema.tables.size },
          findings,
        }),
      );
    }

    if (findings.length === 0) {
      if (!asJson) {
        console.log(
          `✓ Schema-paritet: DEV och PROD är identiska (${devSchema.tables.size} tabeller, ` +
            `${devSchema.columns.size} kolumner, ${devSchema.indexes.size} index, ` +
            `${devSchema.constraints.size} constraints jämförda).`,
        );
      }
      return 0;
    }

    if (!asJson) {
      console.error(`✗ Schema-paritet BRUTEN — ${findings.length} avvikelse(r) mellan DEV och PROD:`);
      for (const f of findings) {
        console.error(`   [${f.kind}] ${f.object}: ${f.detail}`);
      }
      console.error(
        "\nFix: ligger en sida EFTER på migrationer → `npm run db:migrate` (dev) / " +
          "`npm run db:migrate:prod` (prod). Är objektet skapat direkt i Supabase-dashboarden → " +
          "skriv en migration i src/lib/db/migrations/ + MIGRATION_ORDER så båda sidor får den, " +
          "eller ta bort objektet. Perf-index: `npm run db:perf-indexes`.",
      );
    }
    return 1;
  } finally {
    await Promise.allSettled([devPool.end(), prodPool.end()]);
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
