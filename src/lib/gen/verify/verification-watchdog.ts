/**
 * Readiness stale-verification watchdog (pure decision helpers).
 *
 * The readiness route runs a 5-minute watchdog that fails versions stuck in an
 * in-progress verification state (`pending` / `verifying` / `repairing`). The
 * staleness clock is `engine_versions.created_at` (the row has no `updated_at`).
 *
 * #260 round-2 (Codex P2 "clear stale repair state"): a concurrent user edit
 * during a repair leaves the row in `repairing` with the OLD `created_at`, so a
 * naive timeout looked stale and the watchdog failed the user's newer edit B
 * from the abandoned stale repair(A). The fix keeps the cheap timeout filter but
 * makes the `repairing` branch liveness-aware: a `repairing` row is only failed
 * when its lease was GENUINELY lost (a frozen holder = an expired-but-still
 * `running` lease), never when the repair cleanly released after a `stale_base`
 * skip. The repair callers separately re-verify B on a fresh lease, so B reaches
 * an honest terminal state on its own files instead of lingering in `repairing`.
 *
 * These helpers are pure (no DB) so the decision is unit-testable; the route
 * supplies the lease-probe result.
 */
export const STALE_VERIFICATION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Cheap first filter: is the version in an in-progress verification state that
 * has exceeded the stale-verification timeout (clocked by `created_at`)?
 */
export function isTimedOutVerificationState(
  verificationState: string | null | undefined,
  createdAt: string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (
    verificationState !== "pending" &&
    verificationState !== "verifying" &&
    verificationState !== "repairing"
  ) {
    return false;
  }
  if (!createdAt) {
    return false;
  }

  const createdAtMs = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  return now - createdAtMs > STALE_VERIFICATION_TIMEOUT_MS;
}

/**
 * Final watchdog decision. For `pending` / `verifying` a timeout is enough (the
 * subsequent fail write is lease-safe — `failVersionVerificationIfUnleased`
 * no-ops while an active lease still owns the row). For `repairing` we ALSO
 * require evidence the lease was genuinely lost (`hasExpiredRunningLease`), so a
 * cleanly-released `stale_base` skip after a concurrent user edit is never
 * failed — its newer edit B is re-verified on its own files instead.
 *
 * `hasExpiredRunningLease` is `null` when the route did not probe (non-repairing
 * states never need it).
 */
export function resolveStaleWatchdogFail(input: {
  timedOut: boolean;
  verificationState: string | null | undefined;
  hasExpiredRunningLease: boolean | null;
}): boolean {
  if (!input.timedOut) return false;
  if (input.verificationState === "repairing") {
    return input.hasExpiredRunningLease === true;
  }
  return true;
}
