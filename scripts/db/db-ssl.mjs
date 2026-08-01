/**
 * Single owner of how the DB scripts turn a connection string into a `pg` SSL
 * option.
 *
 * Why one owner: `sslmode=disable` (the documented local-Postgres setup, see
 * docs/runbooks/cursor-cloud-agent.md) means "no TLS at all", and every script that opens a pool has to
 * agree on that. When they drift, the failure is confusing rather than obvious
 * — e.g. `db:init` connecting happily while `db:migrate` fails on SSL against
 * the exact same URL, so the fix a guard points you at is the one command that
 * cannot run.
 *
 * Runtime equivalent: `resolvePoolSslConfig` in `src/lib/db/client.ts` (kept
 * separate because it is TypeScript and carries extra runtime warnings).
 */

/**
 * @param {string | undefined} connectionString
 * @returns {string | null} lowercased `sslmode` from the URL, or null.
 */
function readSslMode(connectionString) {
  if (!connectionString) return null;
  try {
    return (
      new URL(connectionString).searchParams.get("sslmode")?.trim().toLowerCase() ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * The `ssl` option to hand to `new Pool()`.
 *
 * `sslmode=disable` wins over the verification-relaxing inputs: those control
 * how strict TLS is, never whether TLS is used at all. Anything else keeps
 * certificate verification on unless explicitly relaxed (Supabase presents a
 * self-signed chain, hence `DB_SSL_REJECT_UNAUTHORIZED=false`).
 *
 * @param {string | undefined} connectionString
 * @param {{ allowInsecureSsl?: boolean, env?: Record<string, string | undefined> }} [options]
 * @returns {false | { rejectUnauthorized: boolean }}
 */
export function resolveSslConfig(
  connectionString,
  { allowInsecureSsl = false, env = process.env } = {},
) {
  if (readSslMode(connectionString) === "disable") return false;

  return {
    rejectUnauthorized: !(
      allowInsecureSsl ||
      env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() === "false"
    ),
  };
}
