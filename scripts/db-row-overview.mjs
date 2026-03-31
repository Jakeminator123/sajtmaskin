/**
 * Read-only: rad-uppskattning per tabell för dev/staging-granskning.
 * Användning: från repo-rot med `.env.local` som sätter POSTGRES_URL.
 *
 *   npm run db:rows
 *
 * Ingen TRUNCATE, ingen skrivning. Kör inte mot prod utan att du medvetet
 * accepterar belastning (COUNT(*) kan vara tungt på stora tabeller).
 */
import { config } from "dotenv";
import pg from "pg";
import { normalizeEnvUrl, warnIfProdLikeReadTarget } from "./db-target-guard.mjs";

config({ path: ".env.local" });
warnIfProdLikeReadTarget({ commandName: "db:rows" });

const allowInsecureSsl = process.argv.includes("--allow-insecure-ssl");

const cs = normalizeEnvUrl(
  process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL,
);
if (!cs) {
  console.error("Databas-URL saknas (.env.local / pulled env).");
  process.exit(1);
}

const url = new URL(cs);
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");

function resolveSsl() {
  const raw = process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();
  if (raw === "false" || allowInsecureSsl) {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

/** Tabeller vi bryr oss om i städ-/synk-sammanhang (own-engine + app + legacy). */
const TABLES = [
  "engine_chats",
  "engine_messages",
  "engine_versions",
  "engine_generation_logs",
  "generation_telemetry",
  "version_comments",
  "version_approvals",
  "app_projects",
  "project_data",
  "project_files",
  "images",
  "media_library",
  "prompt_handoffs",
  "prompt_logs",
  "chats",
  "versions",
  "projects",
  "deployments",
  "version_error_logs",
  "users",
];

const pool = new pg.Pool({
  connectionString: url.toString(),
  ssl: resolveSsl(),
});

function quoteTable(name) {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`invalid table name: ${name}`);
  return `"${name}"`;
}

try {
  const hostPreview = `${url.hostname} / db=${url.pathname?.replace(/^\//, "") || "default"}`;
  console.log("db_row_overview:", hostPreview);
  console.log("table\texists\tapprox_rows");

  for (const table of TABLES) {
    const ex = await pool.query(
      `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1 limit 1`,
      [table],
    );
    const exists = ex.rowCount === 1;
    if (!exists) {
      console.log(`${table}\tno\t-`);
      continue;
    }
    const c = await pool.query(`select count(*)::bigint as n from ${quoteTable(table)}`);
    console.log(`${table}\tyes\t${String(c.rows[0]?.n ?? "?")}`);
  }
  await pool.end();
} catch (e) {
  console.error("db_row_overview_error:", e instanceof Error ? e.message : String(e));
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
