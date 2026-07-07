#!/usr/bin/env node
/**
 * Read-only migration-status gate.
 *
 * Verifies that the target Postgres has EVERY migration in MIGRATION_ORDER
 * recorded in its `schema_migrations` ledger. Exits non-zero when the database
 * is behind (or the ledger is uninitialized) so CI reddens until someone runs
 * `npm run db:migrate:prod` (prod) / `npm run db:migrate` (dev).
 *
 * Connection: reads POSTGRES_URL* / DATABASE_URL from process.env, or from an
 * env file via `--env=<path>`. If NO connection is configured it SKIPs with a
 * WARN and exits 0 — mirrors db-blob-sync-check so forks / no-secret CI envs
 * still pass meaningfully.
 *
 * Strictly read-only: only SELECTs the ledger. Safe to run against production.
 *
 * Usage:
 *   node scripts/db/check-migrations-applied.mjs
 *   node scripts/db/check-migrations-applied.mjs --env=.env.vercel.production.pulled --allow-insecure-ssl
 *   node scripts/db/check-migrations-applied.mjs --json
 */
import { Pool } from "pg";
import { config } from "dotenv";
import { existsSync } from "fs";
import { MIGRATION_ORDER } from "./migration-order.mjs";
import { readAppliedMigrations, diffPendingMigrations } from "./migration-ledger.mjs";
import { normalizeEnvUrl } from "./db-target-guard.mjs";

const args = process.argv.slice(2);
const envArg = args.find((a) => a.startsWith("--env="));
const allowInsecureSsl = args.includes("--allow-insecure-ssl");
const asJson = args.includes("--json");

if (envArg) {
  const envPath = envArg.slice("--env=".length);
  if (existsSync(envPath)) {
    config({ path: envPath });
  } else {
    console.warn(`[db:migrate:check] --env file not found: ${envPath}`);
  }
}

const CONNECTION_KEYS = [
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "STORAGE_POSTGRES_URL",
  "STORAGE_POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
];

function resolveConnectionString() {
  for (const key of CONNECTION_KEYS) {
    const value = normalizeEnvUrl(process.env[key]);
    if (value) return value;
  }
  return undefined;
}

const connectionString = resolveConnectionString();
if (!connectionString) {
  // No DB configured (fork / no-secret CI env) — skip meaningfully, like
  // db-blob-sync-check does. Not a failure.
  console.warn(
    "[db:migrate:check] No database connection configured — SKIP (exit 0).",
  );
  process.exit(0);
}

const rejectUnauthorized = !(
  allowInsecureSsl ||
  process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() === "false"
);

const cleanUrl = (() => {
  try {
    const u = new URL(connectionString);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("supa");
    return u.toString();
  } catch {
    return connectionString;
  }
})();

const targetHost = (() => {
  try {
    return new URL(cleanUrl).host;
  } catch {
    return "unknown";
  }
})();

const pool = new Pool({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized },
  max: 2,
  connectionTimeoutMillis: 10_000,
});

let exitCode = 0;
try {
  const applied = await readAppliedMigrations(pool);
  const pending = diffPendingMigrations(applied);

  if (pending.length === 0) {
    const msg = `✓ Migration ledger up to date on ${targetHost}: all ${MIGRATION_ORDER.length} migration(s) recorded as applied.`;
    console.log(
      asJson
        ? JSON.stringify({ ok: true, host: targetHost, total: MIGRATION_ORDER.length, pending: [] })
        : msg,
    );
  } else {
    exitCode = 1;
    const note =
      applied === null
        ? "schema_migrations ledger not initialized on this database"
        : `${pending.length} migration(s) not yet applied to this database`;
    if (asJson) {
      console.log(JSON.stringify({ ok: false, host: targetHost, note, pending }));
    } else {
      console.error(`✗ ${targetHost} is BEHIND on migrations — ${note}:`);
      for (const f of pending) console.error(`   - ${f}`);
      console.error(
        "\nFix: run `npm run db:migrate:prod` (production) or `npm run db:migrate` (dev) " +
          "to apply + record the missing migration(s).",
      );
    }
  }
} catch (err) {
  exitCode = 1;
  console.error(
    "[db:migrate:check] Check failed:",
    err instanceof Error ? err.message : String(err),
  );
} finally {
  await pool.end();
}

process.exit(exitCode);
