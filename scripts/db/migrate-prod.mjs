#!/usr/bin/env node
/**
 * PRODUCTION migration apply. A separate owner-authorized step, never a normal
 * consequence of a merge — see docs/runbooks/db-migrations.md § Innan live-apply.
 *
 * Wraps `run-migrations.ts` so the prod incantation cannot be half-remembered:
 *   - requires `.env.vercel.production.pulled` (else tells you to pull it),
 *   - requires `--reason=<owner decision>` so every live apply names its mandate,
 *   - uses the direct/session-mode URL (`POSTGRES_URL_NON_POOLING`), never the
 *     transaction-pooled `POSTGRES_URL`: DDL needs a session-bound advisory lock,
 *   - checks that the URL is the registered prod target (config/db-targets.json),
 *   - sets DB_ALLOW_PROD_LIKE_WRITE=1 (the explicit prod-write ack that
 *     db-target-guard requires) and DB_SSL_REJECT_UNAUTHORIZED=false
 *     (Supabase presents a self-signed cert chain).
 *
 * run-migrations applies only files missing from the schema_migrations ledger,
 * each in one transaction with its ledger row, and refuses a missing ledger.
 * It does not validate historical checksums or detect every idempotent no-op.
 * Inspect the pending plan (`npm run db:migrate:check:prod`) and existing schema
 * before applying; see the runbook for reconciliation requirements.
 */
import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { checkDbEnvTarget, loadDbTargets } from "./check-db-env-target.mjs";
import { normalizeEnvUrl } from "./db-target-guard.mjs";

const SNAPSHOT = ".env.vercel.production.pulled";

function fail(message) {
  console.error(`[db:migrate:prod] ${message}`);
  process.exit(1);
}

function parseReason(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--reason=")) return arg.slice("--reason=".length).trim();
    if (arg === "--reason") return String(argv[i + 1] ?? "").trim();
  }
  return "";
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

const reason = parseReason(process.argv.slice(2));
if (!reason) {
  fail('Missing --reason. Example: npm run db:migrate:prod -- --reason="owner approved add-x.sql"');
}

if (!existsSync(SNAPSHOT)) {
  fail(`Missing ${SNAPSHOT}.\nPull the production env first:  npm run env:pull:prod-snapshot`);
}

// Direct/session mode only. No fallback to the pooled URL.
const prodUrl =
  readKey(SNAPSHOT, "POSTGRES_URL_NON_POOLING") ||
  readKey(SNAPSHOT, "STORAGE_POSTGRES_URL_NON_POOLING");
if (!prodUrl) {
  fail(`No POSTGRES_URL_NON_POOLING in ${SNAPSHOT}; refusing to run DDL through the pooled URL.`);
}

const target = checkDbEnvTarget({ expect: "prod", urlValue: prodUrl, targets: loadDbTargets() });
if (!target.ok || target.level !== "ok") {
  fail(`Target check failed: ${target.message}`);
}

const host = (() => {
  try {
    const url = new URL(prodUrl);
    return `${url.hostname}:${url.port || "5432"}`;
  } catch {
    return "unknown";
  }
})();

console.log("======================================================================");
console.log("  ⚠  Migrating the PRODUCTION database");
console.log(`     Target: ${host}`);
console.log(`     Reason: ${reason}`);
console.log("     Pending only, one transaction per file, advisory-locked.");
console.log("======================================================================");

const res = spawnSync("npx", ["tsx", "scripts/db/run-migrations.ts"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    // run-migrations loads .env.local via dotenv, which does NOT override
    // already-set process.env, and POSTGRES_URL is the first alias it reads,
    // so this prod URL wins.
    POSTGRES_URL: prodUrl,
    DB_ALLOW_PROD_LIKE_WRITE: "1",
    DB_SSL_REJECT_UNAUTHORIZED: "false",
  },
});

process.exit(res.status ?? 1);
