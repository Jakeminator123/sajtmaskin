import { NextResponse } from "next/server";
import { VersionLeaseHeldError } from "@/lib/db/version-lease-error";

/**
 * Translate a {@link VersionLeaseHeldError} — a `files_json` write blocked
 * because a foreign verify/repair job owns the version lease — into the
 * canonical retryable 409 the quality-gate / repair / accept-repair routes
 * already emit (`code: "version_busy"`). Returns `null` for any other error so
 * the caller keeps its existing handling (500 / provider-error translation).
 *
 * Callers use it at the top of their `catch`:
 *   const busy = versionBusyResponseIfLeaseHeld(err);
 *   if (busy) return busy;
 */
export function versionBusyResponseIfLeaseHeld(err: unknown): NextResponse | null {
  if (err instanceof VersionLeaseHeldError) {
    return NextResponse.json(
      {
        error: "Version is busy (another verify/repair job holds the lock). Try again shortly.",
        code: "version_busy",
        retryable: true,
      },
      { status: 409 },
    );
  }
  return null;
}
