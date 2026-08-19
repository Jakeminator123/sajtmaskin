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

/**
 * Deny-by-default on the ledger (SM-057). The `public` schema's default
 * privileges grant ALL to `anon` and `authenticated` on every new table, and
 * this table is born from a bare `CREATE TABLE` outside MIGRATION_ORDER — so
 * without this it is readable, writable and TRUNCATE-able with the public anon
 * key over PostgREST. The table owner (`postgres`, the same role the runners
 * connect as) bypasses RLS, so enabling it costs the runners nothing.
 *
 * Kept in lockstep with `src/lib/db/migrations/harden-schema-migrations-ledger.sql`,
 * which repairs databases that were created before this existed. Both are
 * needed: the migration cannot protect a ledger that is dropped and recreated
 * after the migration was already recorded.
 */
const HARDEN_LEDGER_SQL = `
DO $$
BEGIN
  IF to_regclass('public.${LEDGER_TABLE}') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.${LEDGER_TABLE} ENABLE ROW LEVEL SECURITY';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.${LEDGER_TABLE} FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.${LEDGER_TABLE} FROM authenticated';
  END IF;
END
$$;
`;

/** Create the ledger table if it does not exist yet. Idempotent. */
export async function ensureMigrationLedger(pool) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
       filename text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  await pool.query(HARDEN_LEDGER_SQL);
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
