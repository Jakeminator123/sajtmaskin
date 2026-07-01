/**
 * Terminal-settle helpers shared by the two status surfaces that read an
 * `engine_versions` row's verification lifecycle:
 *
 *   • `GET .../readiness`       — publish-readiness projection
 *   • `GET .../version-status`  — the bus projection the builder spinner polls
 *
 * Before this module the stale-verification watchdog lived ONLY on
 * `/readiness` and wrote the DB `verification_state`, while the builder's
 * `useVersionStatus` spinner reads the *event-bus* projection via
 * `/version-status`. The two never converged: a background verify job that
 * died without emitting a terminal bus event left the bus stuck on
 * `verifying`/`repairing` forever (perpetual "Verifierar"-spinner), even though
 * the DB watchdog would already have failed the row. These helpers let both
 * surfaces share one terminal deadline + reconciliation so the UI can never
 * spin forever.
 *
 * Pure by design (no DB import) so the projection logic is unit-testable
 * without a database connection. The lease-safe DB write lives in the sibling
 * `settle-stale-verification.ts`.
 */
import { STALE_VERIFICATION_TIMEOUT_MS } from "@/lib/gen/defaults";
import type { VersionStatus } from "@/lib/logging/event-bus-types";

/**
 * Verification states that keep a status surface in a non-terminal (spinning)
 * state. `repair_available` / `passed` / `failed` are terminal.
 */
const NON_TERMINAL_VERIFICATION_STATES = new Set(["pending", "verifying", "repairing"]);

export function isNonTerminalVerificationState(
  verificationState: string | null | undefined,
): boolean {
  return (
    typeof verificationState === "string" &&
    NON_TERMINAL_VERIFICATION_STATES.has(verificationState)
  );
}

/**
 * True when a version has been sitting in a non-terminal verification state
 * (`pending`/`verifying`/`repairing`) longer than the shared repair/quality-gate
 * route budget. Clock is the version's `created_at`: a deterministic gate
 * failure never gets better by "trying again", so once the budget is blown the
 * row should settle terminally. Terminal states and missing/invalid timestamps
 * are never stale.
 */
export function isTimedOutVerificationState(
  verificationState: string | null | undefined,
  createdAt: string | Date | null | undefined,
): boolean {
  if (!isNonTerminalVerificationState(verificationState)) {
    return false;
  }
  if (!createdAt) {
    return false;
  }
  const createdAtMs = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }
  return Date.now() - createdAtMs > STALE_VERIFICATION_TIMEOUT_MS;
}

/**
 * Reconcile a bus-derived `VersionStatus` with the authoritative DB
 * `verification_state` so a stuck spinner always resolves. Only ever moves a
 * NON-terminal bus phase to a terminal one — never the reverse, and never
 * fabricates success:
 *
 *   • DB `failed` → phase `failed` (kills the common typecheck-fail spinner
 *     where the bus never received the terminal verifier event)
 *   • DB `passed` → phase `done`  (ONLY when the bus reports no blockers; any
 *     `degradations[]` are preserved so a degraded version still maps to
 *     "degraded" downstream, never solid green — the false-green invariant)
 *
 * `repair_available` is intentionally left to the bus: its accept-prompt is
 * surfaced by the readiness/versions surfaces, not this projection, and the
 * client-side poll cap is the ultimate backstop for that rarer case.
 */
export function reconcileTerminalDbState(
  status: VersionStatus,
  dbVerificationState: string | null | undefined,
): VersionStatus {
  // Bus already terminal → trust it (it carries the richest detail).
  if (status.phase === "done" || status.phase === "failed") {
    return status;
  }
  if (dbVerificationState === "failed") {
    return { ...status, phase: "failed" };
  }
  if (
    dbVerificationState === "passed" &&
    !status.verificationBlocked &&
    !status.previewBlocked
  ) {
    return { ...status, phase: "done", done: true };
  }
  return status;
}
