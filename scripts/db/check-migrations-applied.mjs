#!/usr/bin/env node
/**
 * Read-only migration-status gate.
 *
 * Verifies that the target Postgres has EVERY migration in MIGRATION_ORDER
 * recorded in its `schema_migrations` ledger, and that any stored checksum
 * still matches the file on disk. Exits non-zero when the database is behind,
 * the ledger is uninitialized, or a checksum mismatch is detected.
 *
 * Pending set comes from the same `buildMigrationPlan` the runner executes —
 * control and apply cannot drift into different plans.
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
import { join } from "path";
import { MIGRATION_ORDER } from "./migration-order.mjs";
import { readAppliedMigrations } from "./migration-ledger.mjs";
import {
  assertPlanExecutable,
  buildMigrationPlan,
  loadMigrationFiles,
  planFilenamesToApply,
} from "./migration-plan.mjs";
import { normalizeEnvUrl } from "./db-target-guard.mjs";

const args = process.argv.slice(2);
const envArg = args.find((a) => a.startsWith("--env="));
const allowInsecureSsl = args.includes("--allow-insecure-ssl");
const asJson = args.includes("--json");

if (envArg) {
  const envPath = envArg.slice("--env=".length);
  if (!existsSync(envPath)) {
    console.error(`[db:migrate:check] --env file not found: ${envPath}`);
    process.exit(1);
  }
  config({ path: envPath, override: true });
} else {
  config({ path: ".env.local" });
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
  if (envArg) {
    console.error(
      `[db:migrate:check] --env file has no usable Postgres connection ` +
        `(checked ${CONNECTION_KEYS.join(", ")}) — refusing to skip an explicitly requested check.`,
    );
    process.exit(1);
  }
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

const MIGRATIONS_DIR = join(process.cwd(), "src/lib/db/migrations");

let exitCode = 0;
try {
  const applied = await readAppliedMigrations(pool);
  const files = await loadMigrationFiles(MIGRATIONS_DIR);
  const plan = buildMigrationPlan({ applied, files });
  try {
    assertPlanExecutable(plan);
  } catch (err) {
    exitCode = 1;
    const message = err instanceof Error ? err.message : String(err);
    if (asJson) {
      console.log(
        JSON.stringify({
          ok: false,
          host: targetHost,
          note: message,
          pending: planFilenamesToApply(plan),
          mismatches: plan.mismatches,
        }),
      );
    } else {
      console.error(`✗ ${targetHost}: ${message}`);
    }
  }

  if (exitCode === 0) {
    const pending = planFilenamesToApply(plan);
    if (pending.length === 0) {
      const msg = `✓ Migration ledger up to date on ${targetHost}: all ${MIGRATION_ORDER.length} migration(s) recorded as applied.`;
      console.log(
        asJson
          ? JSON.stringify({
              ok: true,
              host: targetHost,
              total: MIGRATION_ORDER.length,
              pending: [],
            })
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
