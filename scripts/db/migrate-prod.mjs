#!/usr/bin/env node
/**
 * One-command PRODUCTION migration apply — the idiot-proof "migrate prod" button.
 *
 * Wraps `run-migrations.ts` so you don't have to remember the prod incantation:
 *   - requires `.env.vercel.production.pulled` (else tells you to pull it),
 *   - points the migration at the POOLED prod URL from that snapshot
 *     (db-env-parity.mdc: use pooler.supabase.com for prod, not the direct URL),
 *   - sets DB_ALLOW_PROD_LIKE_WRITE=1 (the explicit prod-write ack that
 *     db-target-guard requires) and DB_SSL_REJECT_UNAUTHORIZED=false
 *     (Supabase presents a self-signed cert chain),
 *   - runs the SAME run-migrations logic, which now records every applied
 *     migration into the schema_migrations ledger.
 *
 * Safe: run-migrations still calls assertSafeWriteTarget, and every migration
 * statement is idempotent (`IF NOT EXISTS`), so re-running is a no-op.
 */
import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { normalizeEnvUrl } from "./db-target-guard.mjs";

const SNAPSHOT = ".env.vercel.production.pulled";

if (!existsSync(SNAPSHOT)) {
  console.error(
    `[db:migrate:prod] Missing ${SNAPSHOT}.\n` +
      "Pull the production env first:  npm run env:pull:prod-snapshot",
  );
  process.exit(1);
}

function readKey(file, key) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    if (line.slice(0, i).trim() !== key) continue;
    const raw = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    return normalizeEnvUrl(raw);
  }
  return undefined;
}

// Prefer the pooled prod URL; fall back to the Vercel storage alias.
const prodUrl = readKey(SNAPSHOT, "POSTGRES_URL") || readKey(SNAPSHOT, "STORAGE_POSTGRES_URL");
if (!prodUrl) {
  console.error(`[db:migrate:prod] No POSTGRES_URL found in ${SNAPSHOT}.`);
  process.exit(1);
}

const host = (() => {
  try {
    return new URL(prodUrl).host;
  } catch {
    return "unknown";
  }
})();

console.log("======================================================================");
console.log("  ⚠  Migrating the PRODUCTION database");
console.log(`     Target: ${host}`);
console.log("     Idempotent (IF NOT EXISTS) + records the schema_migrations ledger.");
console.log("======================================================================");

const res = spawnSync("npx", ["tsx", "scripts/db/run-migrations.ts"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    // Set the prod URL explicitly. run-migrations loads .env.local via dotenv,
    // which does NOT override already-set process.env, so this prod URL wins.
    POSTGRES_URL: prodUrl,
    DB_ALLOW_PROD_LIKE_WRITE: "1",
    DB_SSL_REJECT_UNAUTHORIZED: "false",
  },
});

process.exit(res.status ?? 1);
