/**
 * Lease-safe stale-verification watchdog shared by `/readiness` and
 * `/version-status`. Kept separate from the pure `stale-verification.ts`
 * helpers because it touches the DB (`@/lib/db/chat-repository-pg` throws at
 * import time without a connection string), which would make the pure
 * projection logic un-testable if co-located.
 */
import {
  failVersionVerificationIfUnleased,
  leaseTableExists,
  type Version,
} from "@/lib/db/chat-repository-pg";
import { isTimedOutVerificationState } from "./stale-verification";

const GENERIC_TIMEOUT_SUMMARY =
  "Automatisk verifiering tog för lång tid. Starta en ny förfining eller försök igen.";

/**
 * Summary stamped on a version the watchdog reconciles from a stuck-but-green
 * `verifying` row to `promoted` (Codex P1 on #518). Kept here so both status
 * surfaces (`/readiness`, `/version-status`) use identical copy when they thread
 * `promoteReconciledVersion`.
 */
export const RECONCILED_PROMOTE_SUMMARY =
  "Rekoncilierad: quality gate passerade; promotering återhämtad efter timeout.";

/**
 * Fails a version stuck in a non-terminal verification state past the route
 * budget — but ONLY if no job holds an active lease (the guard lives inside
 * `failVersionVerificationIfUnleased`'s conditional UPDATE, so a legitimately
 * running verify/repair that keeps renewing its lease is never failed out from
 * under it).
 *
 * `repairing` additionally requires the lease table to exist before we treat it
 * as stale: without the lease table the fail would degrade to unconditional and
 * could kill a still-running unlocked repair (Codex P2). Fail-safe: any DB error
 * leaves the version unchanged.
 *
 * @returns the (possibly updated) version row and whether it was failed.
 */
export async function settleStaleVerificationIfNeeded(
  version: Version,
  opts?: {
    resolveFailureSummary?: () => Promise<string | null> | string | null;
    /**
     * BB#299 / M#vlane2: before terminal-failing a stale row, ask whether the
     * version's latest quality-gate verdict is already green/advisory. When the
     * gate passed but a transient promote-UPDATE timeout (prod incident
     * 2026-07-13) left the row spinning at `verifying` — including the
     * `promoteGuardUnavailable` branch that also leaves it `verifying` — the
     * watchdog must NOT turn that passed gate into a false-red `failed`.
     * When paired with `promoteReconciledVersion` the watchdog first TRIES to
     * settle the green row to a terminal `promoted` state (see below); it only
     * no-ops when that recovery is unavailable or declined.
     * Best-effort: a throw is swallowed and the normal fail path continues.
     */
    resolveLatestGateGreen?: () => Promise<boolean> | boolean;
    /**
     * Codex P1 (#518): recover a proven-green stale row to a TERMINAL state
     * instead of leaving it in permanent limbo. When `resolveLatestGateGreen`
     * confirmed the latest quality-gate verdict passed but the route's
     * promote-UPDATE exhausted its retries (transient timeout), the row is stuck
     * at `verifying` with a green gate log — `/version-status` never reconciles
     * to `done`, F3-readiness/deploy stays blocked, and resume only picks
     * `pending` rows. The caller threads a GUARDED promotion here (canonical
     * `promoteVersion`, which itself consults the promote-guard and refuses on
     * telemetry-mismatch / read error → never a false-green). Contract:
     *   - returns a `Version` → promotion took; the watchdog returns that
     *     terminal (`passed`/`promoted`) row.
     *   - returns `null` (guard-denied / transient / lease miss) or throws →
     *     the watchdog no-ops so the next sweep can retry. NEVER terminal-fail a
     *     green gate.
     * Omitted → the green branch stays a pure no-op (previous behaviour).
     */
    promoteReconciledVersion?: () => Promise<Version | null>;
  },
): Promise<{ version: Version; failed: boolean }> {
  // Design previews (F2) intentionally rest at `pending` — server-verify is
  // skipped and only the event bus records the skipped verifier. Never fail such
  // a row by age alone (Codex + Vercel #337 P1): that would turn a valid,
  // launchable design preview into a false-red on both /readiness and the 4s
  // /version-status poll. A `verifying`/`repairing` row means a verify/repair
  // ACTUALLY started, so it stays settleable when stuck regardless of stage.
  const lifecycleStage =
    typeof version.lifecycle_stage === "string" ? version.lifecycle_stage : "design";
  if (version.verification_state === "pending" && lifecycleStage !== "integrations") {
    return { version, failed: false };
  }

  let staleCandidate = isTimedOutVerificationState(
    version.verification_state,
    version.created_at,
  );
  if (staleCandidate && version.verification_state === "repairing") {
    staleCandidate = await leaseTableExists().catch(() => false);
  }
  if (!staleCandidate) {
    return { version, failed: false };
  }

  // BB#299 / M#vlane2 reconciliation: a stale row whose LATEST quality-gate
  // verdict already passed (green/advisory) must NOT be terminal-failed. The
  // gate proved the version launchable; a transient promote-UPDATE timeout
  // (prod incident 2026-07-13) — or the `promoteGuardUnavailable` retryable
  // branch — merely left it spinning at `verifying`. Best-effort: a resolver
  // throw falls through to the normal fail path so the perpetual-spinner guard
  // still applies.
  let latestGateGreen = false;
  try {
    latestGateGreen = (await opts?.resolveLatestGateGreen?.()) === true;
  } catch {
    latestGateGreen = false;
  }
  if (latestGateGreen) {
    // Codex P1 (#518): don't just no-op a proven-green row — that traded a
    // false-red for permanent limbo (`/version-status` never reaches `done`,
    // F3-readiness/deploy stays blocked, resume ignores it). TRY a guarded
    // promotion so the row can reach a terminal `promoted`/`passed` state. The
    // caller's `promoteReconciledVersion` uses the canonical `promoteVersion`,
    // whose built-in promote-guard refuses on telemetry-mismatch / read error,
    // so this can never false-green a genuinely-blocked row. A promoted row is
    // returned as-is; a `null`/throw (guard-denied / transient / lease miss)
    // falls back to the historic no-op (next sweep retries) — never a fail.
    if (opts?.promoteReconciledVersion) {
      let reconciled: Version | null = null;
      try {
        reconciled = await opts.promoteReconciledVersion();
      } catch {
        reconciled = null;
      }
      if (reconciled) {
        return { version: reconciled, failed: false };
      }
    }
    return { version, failed: false };
  }

  // Prefer the concrete already-logged gate failure (e.g. a deterministic
  // typecheck error) over the generic "took too long" copy — resolved lazily so
  // the (extra) error-log read only happens when a row is actually stale. The
  // resolve is best-effort: a transient log-read failure must NOT abort the
  // settle (else the perpetual-spinner this guards against goes unhandled), so
  // fall back to the generic summary (Bugbot #337).
  let concreteFailureSummary: string | null = null;
  try {
    concreteFailureSummary = (await opts?.resolveFailureSummary?.()) ?? null;
  } catch {
    concreteFailureSummary = null;
  }
  const timedOutVersion = await failVersionVerificationIfUnleased(
    version.id,
    concreteFailureSummary ?? GENERIC_TIMEOUT_SUMMARY,
  ).catch(() => null);

  if (timedOutVersion) {
    return { version: timedOutVersion, failed: true };
  }
  return { version, failed: false };
}
