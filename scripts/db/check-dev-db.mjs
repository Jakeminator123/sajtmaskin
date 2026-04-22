import { config } from "dotenv";
import pg from "pg";
import { normalizeEnvUrl, warnIfProdLikeReadTarget } from "./db-target-guard.mjs";

config({ path: ".env.local" });
warnIfProdLikeReadTarget({ commandName: "db:check" });

const allowInsecureSsl = process.argv.includes("--allow-insecure-ssl");

const cs = normalizeEnvUrl(
  process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.STORAGE_POSTGRES_URL ||
    process.env.STORAGE_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL,
);
if (!cs) {
  console.log("Database URL: missing");
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
  "engine_version_error_logs",
  "generation_telemetry",
  "version_comments",
  "version_approvals",
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
