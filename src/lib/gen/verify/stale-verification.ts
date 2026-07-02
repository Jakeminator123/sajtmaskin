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
 * ONE exception to "terminal bus wins" (M#flap1): DB `passed` **+ release
 * `promoted`** upgrades even a terminal bus `failed`. A path that emitted a
 * terminal `failed` and LATER promoted (gate-fail → repair → accept-repair →
 * promoted) leaves a stale `failed` on the bus with no later terminal emit —
 * the UI then shows "Verifiering misslyckades" while the authoritative store
 * (which promote/deploy read) says promoted/passed. This is not a false-green
 * risk: `promoted` is the strongest positive signal in the system.
 *
 * `repair_available` is intentionally left to the bus: its accept-prompt is
 * surfaced by the readiness/versions surfaces, not this projection, and the
 * client-side poll cap is the ultimate backstop for that rarer case.
 */
export function reconcileTerminalDbState(
  status: VersionStatus,
  dbVerificationState: string | null | undefined,
  dbReleaseState?: string | null,
): VersionStatus {
  // DB `failed` is authoritative-negative: honor it even over a `done` bus so a
  // version the quality gate failed can never read as green. This is the
  // false-green guard — promote/deploy/readiness all read the DB, so the status
  // surface must agree once the DB says failed. (Codex/Bugbot #337.)
  if (dbVerificationState === "failed" && status.phase !== "failed") {
    return { ...status, phase: "failed" };
  }
  // M#flap1: authoritative-positive exception — promoted+passed in the DB
  // upgrades a stale terminal bus `failed` (see JSDoc). Degradations are
  // preserved by the spread so a degraded version still renders degraded.
  if (
    status.phase === "failed" &&
    dbVerificationState === "passed" &&
    dbReleaseState === "promoted"
  ) {
    return { ...status, phase: "done", done: true };
  }
  // Otherwise a terminal bus wins — never fabricate success over a bus `failed`.
  if (status.phase === "done" || status.phase === "failed") {
    return status;
  }
  // DB `passed` upgrades a still-spinning bus to done, but only with no blockers,
  // so a degraded/blocked version never gets settled to solid green.
  if (
    dbVerificationState === "passed" &&
    !status.verificationBlocked &&
    !status.previewBlocked
  ) {
    return { ...status, phase: "done", done: true };
  }
  return status;
}
