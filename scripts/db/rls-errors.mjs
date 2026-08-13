/**
 * Classify RLS-setup errors in `db-init.mjs`.
 *
 * Vanilla `postgres:16` (CI) has no Supabase `service_role`. A catch that
 * substring-matches `"does not exist"` swallows BOTH missing tables (42P01,
 * which `ALTER TABLE IF EXISTS` already guards) AND missing roles (42704).
 * The latter left quality green with dozens of Postgres ERROR lines.
 *
 * Match on SQLSTATE first. Message fallback is table-shaped only
 * (`relation "x" does not exist`), never the generic "does not exist" that
 * also matches `role "service_role" does not exist`.
 *
 * @param {unknown} err
 * @returns {boolean} true = skip (undefined table); false = fatal
 */
export function isIgnorableRlsError(err) {
  if (err && typeof err === "object" && "code" in err) {
    const code = /** @type {{ code?: unknown }} */ (err).code;
    if (code === "42P01") return true; // undefined_table
    if (typeof code === "string" && code.length > 0) return false;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /relation ["'].+["'] does not exist/i.test(message);
}
