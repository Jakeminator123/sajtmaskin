/**
 * Classify a DB failure as **transient** (worth retrying) or not.
 *
 * Motivated by the prod incident 2026-07-13: a redeploy mid-session plus hard
 * client polling exhausted the per-instance pg pool, and every polled read
 * route (`version-status`, `readiness`, `versions`, `dossiers`) threw
 * `timeout exceeded when trying to connect` → HTTP 500. A 500 tells the client
 * "permanent failure", so the builder logged 29 console errors and kept
 * hammering at full cadence instead of backing off.
 *
 * Only failures where the *connection* (or a row lock) is the problem count as
 * transient. A missing connection string, a schema error or a genuine query bug
 * must keep surfacing as 500 — masking those as a retryable 503 would turn a
 * hard error into an infinite client retry loop.
 *
 * No `pg`/drizzle imports: route tests that mock the repository modules must
 * still be able to import this classifier.
 */

/** Seconds put in `Retry-After` when a read route degrades to 503. */
export const TRANSIENT_DB_RETRY_AFTER_SECONDS = 3;

/**
 * Postgres SQLSTATE codes that mean "try again", not "your query is wrong":
 * class 08 (connection exception), serialization/deadlock, connection-limit
 * exhaustion, lock timeouts and server shutdown/startup states.
 */
const TRANSIENT_PG_CODES = new Set([
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
  "08007", // transaction_resolution_unknown
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "53300", // too_many_connections
  "53400", // configuration_limit_exceeded
  "55P03", // lock_not_available (our own lock_timeout)
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now (server still starting)
]);

/** Node socket-level failures that surface as `error.code`. */
const TRANSIENT_SOCKET_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

/**
 * Lowercased message fragments for failures that carry no usable code — most
 * importantly `pg.Pool`'s own connect timeout, which is a plain `Error`.
 */
const TRANSIENT_MESSAGE_FRAGMENTS = [
  "timeout exceeded when trying to connect",
  "connection terminated",
  "connection ended unexpectedly",
  "client has encountered a connection error",
  "server closed the connection unexpectedly",
  "too many clients already",
  "max clients reached",
  "emaxconnsession",
  "terminating connection due to administrator command",
  "canceling statement due to conflict with recovery",
];

/** Follow `cause` chains (drizzle/undici wrap the driver error) with a bound. */
function errorChain(error: unknown, maxDepth = 5): unknown[] {
  const chain: unknown[] = [];
  let current = error;
  for (let depth = 0; depth < maxDepth && current !== null && current !== undefined; depth += 1) {
    chain.push(current);
    const cause = (current as { cause?: unknown }).cause;
    if (cause === current) break;
    current = cause;
  }
  return chain;
}

function linkIsTransient(link: unknown): boolean {
  if (typeof link !== "object" || link === null) return false;

  const code = (link as { code?: unknown }).code;
  if (typeof code === "string") {
    if (TRANSIENT_PG_CODES.has(code.toUpperCase())) return true;
    if (TRANSIENT_SOCKET_CODES.has(code.toUpperCase())) return true;
  }

  const message = (link as { message?: unknown }).message;
  if (typeof message === "string") {
    const haystack = message.toLowerCase();
    return TRANSIENT_MESSAGE_FRAGMENTS.some((fragment) => haystack.includes(fragment));
  }

  return false;
}

/**
 * `true` when the failure is a connection/contention problem the caller can
 * retry. Everything else (config errors, schema errors, bugs) is `false`.
 */
export function isTransientDbError(error: unknown): boolean {
  return errorChain(error).some(linkIsTransient);
}
