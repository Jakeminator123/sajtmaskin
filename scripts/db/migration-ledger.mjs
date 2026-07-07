/**
 * schema_migrations ledger — the single record of which hand-written SQL
 * migrations have been applied to a given database.
 *
 * Why: the migrations in `src/lib/db/migrations/*.sql` are idempotent
 * (`IF NOT EXISTS`), so `run-migrations.ts` / `db-init.mjs` re-run them every
 * time and there was no way to answer "is THIS database behind on migrations?".
 * That gap is exactly how prod silently drifts (migrations are NOT applied on
 * Vercel deploy — see .cursor/rules/db-env-parity.mdc). This ledger closes it:
 * every runner records each migration it processes, and
 * `scripts/db/check-migrations-applied.mjs` reads the ledger to gate CI.
 *
 * All writes here are additive and idempotent. Recording is best-effort at the
 * call sites (wrapped in try/catch, warn-only) so a ledger hiccup can never
 * break a migration run or dev startup.
 */
import { MIGRATION_ORDER } from "./migration-order.mjs";

export const LEDGER_TABLE = "schema_migrations";

/** Create the ledger table if it does not exist yet. Idempotent. */
export async function ensureMigrationLedger(pool) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
       filename text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
}

/** Record one migration filename as applied. Idempotent (ON CONFLICT DO NOTHING). */
export async function recordAppliedMigration(pool, filename) {
  await pool.query(
    `INSERT INTO ${LEDGER_TABLE} (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
    [filename],
  );
}

/**
 * Returns the Set of applied migration filenames, or `null` when the ledger
 * table does not exist yet (Postgres undefined_table 42P01). Callers treat
 * `null` as "nothing recorded / ledger not initialized".
 */
export async function readAppliedMigrations(pool) {
  try {
    const res = await pool.query(`SELECT filename FROM ${LEDGER_TABLE}`);
    return new Set(res.rows.map((r) => r.filename));
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "42P01") {
      return null;
    }
    throw err;
  }
}

/**
 * Pure diff: which MIGRATION_ORDER entries are NOT yet applied.
 * `applied === null` (uninitialized ledger) => every migration is pending.
 *
 * @param {Set<string> | null} applied
 * @returns {string[]}
 */
export function diffPendingMigrations(applied) {
  if (applied === null) return [...MIGRATION_ORDER];
  return MIGRATION_ORDER.filter((f) => !applied.has(f));
}
