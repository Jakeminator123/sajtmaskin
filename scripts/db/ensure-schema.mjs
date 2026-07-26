#!/usr/bin/env node
/**
 * "Make THIS database's schema match the repo" — one idempotent command, plus
 * the loud guard that makes a stale local schema impossible to miss.
 *
 * Why this exists: the local/dev DB *is* migrated automatically, but only on the
 * `npm run dev` -> `predev` -> `db:init` path. Three ways it silently did not
 * happen, all of which left dev running against a schema the code no longer
 * matches (e.g. dev missing `add-llm-usage.sql` while prod had it):
 *
 *   1. `db:init:soft` swallows a mid-run failure — the one-line WARN scrolls
 *      away behind Next.js output and dev boots on the old schema anyway.
 *   2. `SKIP_PREDEV=1` / running `node scripts/dev/next-runner.mjs dev`
 *      directly (the documented fast path) skips migrations entirely.
 *   3. Ledger recording is warn-only, so `db:migrate:check` can report BEHIND
 *      even after the SQL itself applied.
 *
 * Modes:
 *   (default)      check -> apply pending via `npm run db:migrate` -> re-verify
 *   --check-only   read-only; never writes. Used as the dev-start guard.
 *   --soft         always exit 0 (dev startup must never be blocked by this)
 *   --quiet-ok     print nothing when already in sync (background guard use)
 *
 * Applying is DELEGATED to `scripts/db/run-migrations.ts` so that stays the one
 * owner of the apply loop and its prod-write guard — this script never runs DDL
 * itself. No connection configured => quiet SKIP (exit 0), mirroring
 * `check-migrations-applied.mjs` so forks / no-secret envs stay meaningful.
 *
 * Usage:
 *   npm run db:ensure                 # fix my local DB
 *   node scripts/db/ensure-schema.mjs --check-only --soft --quiet-ok
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { config } from "dotenv";
import { MIGRATION_ORDER } from "./migration-order.mjs";
import {
  readAppliedMigrations,
  diffPendingMigrations,
} from "./migration-ledger.mjs";
import { resolveDbConnectionString } from "./db-target-guard.mjs";
import { resolveSslConfig } from "./db-ssl.mjs";

const RESET = "\x1b[0m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";

/**
 * Pure decision: what should this run do about `pending` migrations?
 *
 * Split out from the IO so the behaviour that matters — "a read-only guard must
 * never apply", "being behind is not OK just because we are in soft mode" — is
 * unit-testable without a database.
 *
 * @param {{ pending: string[], checkOnly?: boolean }} input
 * @returns {{ action: "ok" | "apply" | "report", inSync: boolean }}
 */
export function decideSchemaAction({ pending, checkOnly = false }) {
  if (pending.length === 0) return { action: "ok", inSync: true };
  return { action: checkOnly ? "report" : "apply", inSync: false };
}

/**
 * Renders the unmissable warning block. A single grey line is exactly how the
 * previous WARN got lost, so this is bordered, coloured and lists the fix.
 * `pending` is optional: an inconclusive run has no known missing set and must
 * not imply one.
 *
 * @param {{ host: string, pending?: string[], color?: string, headline: string, fix: string }} input
 * @returns {string}
 */
export function formatSchemaWarning({
  host,
  pending = [],
  color = YELLOW,
  headline,
  fix,
}) {
  const bar = "-".repeat(74);
  const lines = ["", `${color}${bar}`, `  ${headline}`, `  Database: ${host}`];
  if (pending.length > 0) {
    lines.push(
      `  Missing ${pending.length} of ${MIGRATION_ORDER.length} migration(s):`,
      ...pending.map((f) => `    - ${f}`),
    );
  }
  lines.push("", `  Fix: ${fix}`, `${bar}${RESET}`, "");
  return lines.join("\n");
}

function parseArgs(argv) {
  return {
    checkOnly: argv.includes("--check-only"),
    soft: argv.includes("--soft"),
    quietOk: argv.includes("--quiet-ok"),
    allowInsecureSsl: argv.includes("--allow-insecure-ssl"),
  };
}

function hostOf(connectionString) {
  try {
    return new URL(connectionString).host;
  } catch {
    return "unknown";
  }
}

/** Strip Supabase-specific params pg cannot parse, as the sibling scripts do. */
function cleanConnectionString(connectionString) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("supa");
    return url.toString();
  } catch {
    return connectionString;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const exitCode = (code) => (opts.soft ? 0 : code);

  // `quiet` because this runs as a background guard on every dev start: it must
  // print nothing at all unless something is actually wrong.
  config({ path: ".env.local", quiet: true });

  const connectionString = resolveDbConnectionString();
  if (!connectionString) {
    if (!opts.quietOk) {
      console.warn(
        "[db:ensure] No database connection configured — SKIP (exit 0).",
      );
    }
    return 0;
  }

  const host = hostOf(connectionString);
  const ssl = resolveSslConfig(connectionString, {
    allowInsecureSsl: opts.allowInsecureSsl,
  });

  /**
   * Reads the pending set over a connection opened and closed for this call, so
   * no session of ours is alive while `db:migrate` runs its DDL in the child
   * process.
   */
  async function readPending() {
    const pool = new Pool({
      connectionString: cleanConnectionString(connectionString),
      ssl,
      max: 1,
      connectionTimeoutMillis: 10_000,
    });
    try {
      return diffPendingMigrations(await readAppliedMigrations(pool));
    } finally {
      await pool.end();
    }
  }

  let pending;
  try {
    pending = await readPending();
  } catch (err) {
    // Unreachable DB is not a schema problem — say so plainly and let dev
    // continue rather than implying migrations are missing.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[db:ensure] Could not read migration ledger on ${host}: ${message}`,
    );
    return exitCode(1);
  }

  const { action, inSync } = decideSchemaAction({
    pending,
    checkOnly: opts.checkOnly,
  });

  if (inSync) {
    if (!opts.quietOk) {
      console.log(
        `[db:ensure] ${host} is up to date: all ${MIGRATION_ORDER.length} migration(s) applied.`,
      );
    }
    return 0;
  }

  if (action === "report") {
    console.warn(
      formatSchemaWarning({
        host,
        pending,
        headline:
          "LOCAL DATABASE SCHEMA IS BEHIND — the app may hit missing tables/columns.",
        fix: "npm run db:ensure",
      }),
    );
    return exitCode(1);
  }

  // Delegate applying to the single owner of the apply loop, which also carries
  // the prod-write guard (assertSafeWriteTarget). This script never runs DDL.
  console.log(
    `[db:ensure] ${host} is behind ${pending.length} migration(s) — applying: ${pending.join(", ")}`,
  );
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const applied = spawnSync(npmCmd, ["run", "db:migrate"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  let stillPending;
  try {
    stillPending = await readPending();
  } catch (err) {
    // The re-read failed, so we know nothing about the current state. Reporting
    // the pre-migrate pending list here would claim migrations are missing when
    // db:migrate may well have applied them — say "unverified" instead.
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      formatSchemaWarning({
        host,
        color: RED,
        headline: `COULD NOT VERIFY THE RESULT — ledger re-read failed: ${message}`,
        fix: "npm run db:migrate:check",
      }),
    );
    return exitCode(1);
  }

  if (stillPending.length === 0) {
    console.log(
      `[db:ensure] ${host} is now up to date: all ${MIGRATION_ORDER.length} migration(s) applied.`,
    );
    return 0;
  }

  console.error(
    formatSchemaWarning({
      host,
      pending: stillPending,
      color: RED,
      headline:
        "COULD NOT BRING THE DATABASE IN SYNC — migrations are still missing.",
      fix:
        applied.status === 0
          ? "read the db:migrate output above (SQL applied but not recorded?)"
          : "npm run db:migrate   (see the error above)",
    }),
  );
  return exitCode(1);
}

// Only connect when invoked as a CLI — importing this module from a test must
// stay side-effect free. URL comparison (not path equality) because Windows
// slash/casing differences make raw path checks unreliable.
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`${DIM}[db:ensure]${RESET} unexpected failure:`, err);
      process.exit(process.argv.includes("--soft") ? 0 : 1);
    });
}
