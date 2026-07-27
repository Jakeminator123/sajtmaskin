import { NextResponse } from "next/server";
import {
  isTransientDbError,
  TRANSIENT_DB_RETRY_AFTER_SECONDS,
} from "@/lib/db/transient-error";

/** User-facing text for a degraded read. Swedish: it can reach the builder UI. */
export const TRANSIENT_DB_MESSAGE =
  "Databasen svarar inte just nu. Försöker igen om en stund.";

/**
 * Translate a transient DB failure (pool connect timeout, dropped connection,
 * lock contention) into a retryable **503 + `Retry-After`** instead of a 500.
 * Returns `null` for every other error so the caller keeps its existing
 * handling.
 *
 * The body carries both `ok: false` and `error` so the same payload satisfies
 * every polled read route: `/version-status` clients branch on `ok`, the SWR
 * fetchers behind `/readiness`, `/versions` and `/dossiers` read `error`.
 * `retryable: true` mirrors the error-log route's `row_contention` contract.
 *
 * Callers use it at the top of their `catch`:
 *   const degraded = transientDbResponseIfRetryable(error, "[API] readiness");
 *   if (degraded) return degraded;
 */
export function transientDbResponseIfRetryable(
  error: unknown,
  logLabel: string,
): NextResponse | null {
  if (!isTransientDbError(error)) return null;

  // Warn, not error: this is an expected degradation (redeploy, pool pressure),
  // and logging it as an error is exactly the Sentry noise the 503 removes.
  console.warn(
    `${logLabel} transient DB failure → 503 (retry in ${TRANSIENT_DB_RETRY_AFTER_SECONDS}s):`,
    error instanceof Error ? error.message : error,
  );

  return NextResponse.json(
    {
      ok: false,
      error: TRANSIENT_DB_MESSAGE,
      code: "db_unavailable",
      retryable: true,
    },
    {
      status: 503,
      headers: { "Retry-After": String(TRANSIENT_DB_RETRY_AFTER_SECONDS) },
    },
  );
}
