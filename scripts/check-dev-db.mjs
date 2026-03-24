import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const allowInsecureSsl = process.argv.includes("--allow-insecure-ssl");

function normalizeEnvUrl(value) {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (/^\$\{[A-Z0-9_]+\}$/.test(trimmed)) return undefined;
  if (/^\$[A-Z0-9_]+$/.test(trimmed)) return undefined;
  return trimmed;
}

const cs = normalizeEnvUrl(process.env.POSTGRES_URL);
if (!cs) {
  console.log("POSTGRES_URL: missing");
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
  return {
    rejectUnauthorized: true,
  };
}

const pool = new pg.Pool({
  connectionString: url.toString(),
  ssl: resolveSsl(),
});

const checks = [
  "engine_chats",
  "engine_messages",
  "engine_versions",
  "engine_generation_logs",
];

try {
  for (const table of checks) {
    const r = await pool.query(
      `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1 limit 1`,
      [table],
    );
    console.log(`table_${table}:`, r.rowCount === 1 ? "ok" : "missing");
  }
  const sample = await pool.query(
    `select count(*)::bigint as n from engine_versions`,
  );
  console.log("engine_versions_row_count:", String(sample.rows[0]?.n ?? "0"));
  await pool.end();
} catch (e) {
  console.log("db_error:", e instanceof Error ? e.message : String(e));
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
