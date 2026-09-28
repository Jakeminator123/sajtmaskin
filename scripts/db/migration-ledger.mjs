/**
 * schema_migrations ledger — the single record of which hand-written SQL
 * migrations have been applied to a given database.
 *
 * Apply and control share `scripts/db/migration-plan.mjs`. The runner executes
 * only the plan's `toApply` set; already-ledgered filenames are not re-run.
 *
 * Checksums (sha256 of file bytes at successful apply):
 *   - New successful applications store `checksum`.
 *   - Existing rows created before checksum support have NULL checksum.
 *     Those are treated as applied without content proof — never backfilled
 *     with today's file hash, never re-run solely to fill the gap.
 *   - When a checksum EXISTS and the file content differs, control and apply
 *     both fail (add a new migration file; do not rewrite history).
 *
 * Production apply paths must NOT treat ledger ensure/record failures as
 * success — see `applyPendingMigrations` in migration-plan.mjs.
 */
import { MIGRATION_ORDER } from "./migration-order.mjs";

export const LEDGER_TABLE = "schema_migrations";

/**
 * Create the ledger AND lock it down, deny-by-default (SM-057).
 *
 * The `public` schema's default privileges grant ALL to `anon` and
 * `authenticated` on every new table, and this table is born from a bare
 * `CREATE TABLE` outside MIGRATION_ORDER — so without the lockdown it is
 * readable, writable and TRUNCATE-able with the public anon key over PostgREST.
 * The table owner (`postgres`, the same role the runners connect as) bypasses
 * RLS, so enabling it costs the runners nothing.
 *
 * Creation and lockdown MUST NOT be two statements: `pool.query` autocommits
 * each one (and may even use different pooled connections), so a crash in
 * between would leave the ledger committed and wide open, and rows written in
 * that window would silently survive as trusted. A single `DO` block runs in one
 * implicit transaction, so the table can never exist unprotected.
 *
 * Kept in lockstep with `src/lib/db/migrations/harden-schema-migrations-ledger.sql`,
 * which repairs databases created before this existed. Both are needed: the
 * migration cannot protect a ledger that is dropped and recreated after the
 * migration was already recorded.
 *
 * `checksum` is additive and nullable — existing prod rows stay NULL forever
 * unless an operator deliberately backfills (not done by runners).
 */
const ENSURE_LEDGER_SQL = `
DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS public.${LEDGER_TABLE} (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now(),
    checksum text
  );

  ALTER TABLE public.${LEDGER_TABLE}
    ADD COLUMN IF NOT EXISTS checksum text;

  ALTER TABLE public.${LEDGER_TABLE} ENABLE ROW LEVEL SECURITY;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.${LEDGER_TABLE} FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.${LEDGER_TABLE} FROM authenticated;
  END IF;
END
$$;
`;

/** Create/upgrade the ledger table if needed. Idempotent. Throws on failure. */
export async function ensureMigrationLedger(pool) {
  await pool.query(ENSURE_LEDGER_SQL);
}

/**
 * Record one migration filename as applied with optional sha256 checksum.
 * Idempotent: ON CONFLICT DO NOTHING — never overwrites an existing row or
 * backfills a legacy NULL checksum with today's hash.
 *
 * @param {{ query: (text: string, params?: unknown[]) => Promise<unknown> }} pool
 * @param {string} filename
 * @param {string | null | undefined} [checksum]
 */
export async function recordAppliedMigration(pool, filename, checksum = null) {
  await pool.query(
    `INSERT INTO ${LEDGER_TABLE} (filename, checksum) VALUES ($1, $2)
     ON CONFLICT (filename) DO NOTHING`,
    [filename, checksum ?? null],
  );
}

/**
 * Returns a Map of applied migration filenames → `{ checksum }`, or `null`
 * when the ledger table does not exist yet (Postgres undefined_table 42P01).
 * `checksum` is `null` for legacy rows.
 *
 * @returns {Promise<Map<string, { checksum: string | null }> | null>}
 */
export async function readAppliedMigrations(pool) {
  try {
    const res = await pool.query(`SELECT filename, checksum FROM ${LEDGER_TABLE}`);
    /** @type {Map<string, { checksum: string | null }>} */
    const map = new Map();
    for (const row of res.rows) {
      const raw = row.checksum;
      map.set(row.filename, {
        checksum: typeof raw === "string" && raw.length > 0 ? raw : null,
      });
    }
    return map;
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
 * Accepts Map (runtime), Set of filenames (tests), or null.
 *
 * @param {Map<string, unknown> | Set<string> | null} applied
 * @returns {string[]}
 */
export function diffPendingMigrations(applied) {
  if (applied === null) return [...MIGRATION_ORDER];
  return MIGRATION_ORDER.filter((f) => !applied.has(f));
}
