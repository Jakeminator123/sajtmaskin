#!/usr/bin/env node
/**
 * Settle engine_versions rows stuck in a non-terminal verification state.
 *
 * Companion backfill to the shared /version-status + /readiness stale-
 * verification watchdog (fix/verify-status-single-source). The runtime watchdog
 * only settles a row when that row is polled; this one-pass backfill settles
 * ALREADY-stuck historical rows so that, after the code fix is deployed, no
 * older version is left spinning "Verifierar" forever.
 *
 * Fails rows where:
 *   - verification_state IN ('pending','verifying','repairing')
 *   - created_at older than --older-than-minutes (default 20 — MUST exceed the
 *     verify/repair route budget (~13 min) so a still-running verify is never hit)
 *   - AND no active lease owns the row (engine_version_jobs, when the table
 *     exists) — mirrors failVersionVerificationIfUnleased's lease guard.
 *
 * Safety:
 *   - DRY-RUN by default. Pass --apply to write.
 *   - assertSafeWriteTarget() refuses a prod-like target unless
 *     DB_ALLOW_PROD_LIKE_WRITE=1 (compares against .env.vercel.production.pulled).
 *   - Single lease-guarded UPDATE; idempotent (terminal rows are excluded).
 *
 * Examples:
 *   node scripts/db/settle-stuck-verifications.mjs                       # dry-run
 *   node scripts/db/settle-stuck-verifications.mjs --apply
 *   node scripts/db/settle-stuck-verifications.mjs --apply --older-than-minutes=30
 *   DB_ALLOW_PROD_LIKE_WRITE=1 node scripts/db/settle-stuck-verifications.mjs --apply   # prod
 */

import { Pool } from "pg";
import { config } from "dotenv";
import {
  assertSafeWriteTarget,
  normalizeEnvUrl,
  inspectDbTarget,
  summarizeTarget,
} from "./db-target-guard.mjs";

config({ path: ".env.local" });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const olderThanArg = args.find((a) => a.startsWith("--older-than-minutes="));
const OLDER_THAN_MINUTES = (() => {
  if (!olderThanArg) return 20;
  const n = Number.parseInt(olderThanArg.split("=")[1] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
})();

const SETTLE_SUMMARY =
  "Automatisk verifiering tog för lång tid (settlad av underhållsscript). Starta en ny förfining eller försök igen.";

if (APPLY) {
  assertSafeWriteTarget({ commandName: "settle-stuck-verifications" });
}

const connectionString = normalizeEnvUrl(
  process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.STORAGE_POSTGRES_URL ||
    process.env.STORAGE_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL,
);

if (!connectionString) {
  console.error(
    "Missing database connection URL (POSTGRES_URL / STORAGE_POSTGRES_URL / DATABASE_URL).",
  );
  process.exit(1);
}

const url = new URL(connectionString);
const sslMode = url.searchParams.get("sslmode")?.trim().toLowerCase() || null;
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");

let sslConfig;
if (sslMode === "disable") {
  sslConfig = false;
} else {
  sslConfig = {
    rejectUnauthorized:
      process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !== "false",
  };
}

const pool = new Pool({
  connectionString: url.toString(),
  ssl: sslConfig,
  connectionTimeoutMillis: 8000,
  statement_timeout: 60000,
  query_timeout: 60000,
});

async function leaseTableExists(client) {
  try {
    const r = await client.query("SELECT to_regclass('public.engine_version_jobs') AS oid");
    return r.rows.length > 0 && r.rows[0].oid != null;
  } catch {
    return false;
  }
}

/**
 * WHERE clause shared by the count/sample/update queries. Param: $1 minutes.
 *
 * Only settle rows that would actually leave the UI spinning:
 *   - `verifying`/`repairing` (ANY stage): a verify/repair actually started and
 *     stalled.
 *   - `pending` ONLY for `lifecycle_stage = 'integrations'` (F3): server-verify
 *     was expected but never settled.
 * F2/design previews rest at `pending` BY DESIGN (server-verify is skipped and
 * the bus records the skipped verifier) — failing them would corrupt valid
 * rows (Codex #337 P1), so `pending` design rows are excluded.
 */
function buildWhere(hasLeaseTable) {
  const base = `created_at < now() - ($1 || ' minutes')::interval
    AND (
      verification_state IN ('verifying', 'repairing')
      OR (verification_state = 'pending' AND lifecycle_stage = 'integrations')
    )`;
  if (!hasLeaseTable) return base;
  return `${base}
    AND NOT EXISTS (
      SELECT 1 FROM engine_version_jobs j
      WHERE j.version_id = engine_versions.id
        AND j.status = 'running'
        AND j.lease_expires_at > now()
    )`;
}

async function main() {
  const inspection = inspectDbTarget(process.env);
  const client = await pool.connect();
  try {
    const hasLease = await leaseTableExists(client);
    const where = buildWhere(hasLease);
    const params = [String(OLDER_THAN_MINUTES)];

    console.log("=".repeat(64));
    console.log(`Mode:        ${APPLY ? "APPLY (stuck rows WILL be failed)" : "DRY-RUN (no rows touched)"}`);
    console.log(`Target:      ${summarizeTarget(inspection.current)}${inspection.isProdLike ? "  ⚠ PROD-LIKE" : ""}`);
    console.log(`Older than:  ${OLDER_THAN_MINUTES} min`);
    console.log(`Lease guard: ${hasLease ? "on (engine_version_jobs)" : "off (table absent — legacy fallback)"}`);
    console.log("=".repeat(64));

    const countRes = await client.query(
      `SELECT COUNT(*)::int AS n FROM engine_versions WHERE ${where}`,
      params,
    );
    const n = countRes.rows[0]?.n ?? 0;
    console.log(`\nStuck rows matching: ${n}`);

    if (n > 0) {
      const sample = await client.query(
        `SELECT id, chat_id, verification_state, created_at
           FROM engine_versions
          WHERE ${where}
          ORDER BY created_at ASC
          LIMIT 20`,
        params,
      );
      for (const row of sample.rows) {
        const created =
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
        console.log(
          `   ${created}  ${String(row.verification_state).padEnd(12)}  v=${row.id}  chat=${row.chat_id}`,
        );
      }
      if (n > sample.rows.length) {
        console.log(`   … and ${n - sample.rows.length} more`);
      }
    }

    if (!APPLY) {
      console.log("\nDRY-RUN complete. Re-run with --apply to settle these rows to 'failed'.");
      return;
    }
    if (n === 0) {
      console.log("\nNothing to settle.");
      return;
    }

    const upd = await client.query(
      `UPDATE engine_versions
          SET verification_state = 'failed',
              release_state = 'draft',
              verification_summary = $2,
              repaired_files_json = NULL,
              repair_available_at = NULL,
              promoted_at = NULL
        WHERE ${where}`,
      [...params, SETTLE_SUMMARY],
    );
    console.log(`\nAPPLY complete. Settled ${upd.rowCount} row(s) to 'failed'.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
