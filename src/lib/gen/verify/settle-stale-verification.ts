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
     * Only consulted for a stale `verifying` row (bugbot high, 3rd iteration):
     * `repairing`/pending rows keep the terminal-fail path so a pre-repair green
     * verdict can't reconcile a mid/abandoned-repair row.
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
     * `pending` rows. The caller threads a GUARDED promotion here (the guarded,
     * lease-safe `promoteVersionIfUnleased`, which consults the promote-guard and
     * only writes a row still in `verifying` → never a false-green). Contract:
     *   - returns a `Version`        → promotion took; the watchdog returns that
     *     terminal (`passed`/`promoted`) row.
     *   - returns `"guard_denied"`   → the promote-guard EXPLICITLY refused
     *     (telemetry says the version is blocked — a fresher truth than the stale
     *     gate log). The watchdog then SETTLES the row via the normal terminal-
     *     fail path instead of protecting it, so it can't spin forever (P1b).
     *   - returns `null` (indeterminate read error / lease held / lock timeout /
     *     row no longer `verifying`) or throws → the watchdog no-ops so the next
     *     sweep can retry. NEVER terminal-fail a green gate on a retryable null.
     * Omitted → the green branch stays a pure no-op (previous behaviour).
     */
    promoteReconciledVersion?: () => Promise<Version | "guard_denied" | null>;
    /**
     * Bugbot medium (#518, 4th iteration): the green reconciliation applies ONLY
     * to the chat-head version. A stale `verifying` row that is no longer head is
     * abandoned (superseded by a newer version); if the green branch keeps it
     * alive (no-op) while the promote can't take it, it spins forever with no
     * client-retry path. Gating the WHOLE green branch on head sends a non-head
     * row down the terminal-fail path instead (a pre-existing, acceptable
     * false-red on an abandoned/superseded row — terminal + pollable, not an
     * eternal spinner). The caller threads the chat-head check (mirrors the
     * quality-gate route's `isLatestVersionForChat`). Omitted → treated as head
     * (backwards-compatible). Best-effort: a throw is treated as head so a
     * transient read error never blocks the green recovery.
     */
    resolveIsHeadVersion?: () => Promise<boolean> | boolean;
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

  // BB#299 / M#vlane2 / Codex P1 (#518) reconciliation — SCOPED to `verifying`
  // (bugbot high, 3rd iteration): a stale row whose LATEST quality-gate verdict
  // already passed (green/advisory) must NOT be terminal-failed — the gate
  // proved the version launchable and a transient promote-UPDATE timeout (or the
  // `promoteGuardUnavailable` retryable branch) merely left it spinning.
  //
  // This ONLY applies to a `verifying` row that is STILL the chat head:
  //   - `verifying` is the sole state the promote-timeout profile ever leaves
  //     behind. A stale `repairing` row is EXCLUDED — its latest
  //     `preflight:quality-gate` log can predate `markVersionRepairing`, so a
  //     pre-repair "green" verdict must never promote/no-op a mid/abandoned
  //     repair (it would clobber the repair fields on a stale signal).
  //   - head-only (bugbot medium, 4th iteration): a stale `verifying` row that is
  //     no longer head is abandoned/superseded — keeping it alive here (no-op)
  //     while the promote can't take it would spin forever with no client-retry
  //     path. A non-head row therefore falls through to the terminal-fail path
  //     below (pre-existing, acceptable false-red on a superseded row).
  // `repairing` / pending-integrations / non-head all keep the terminal-fail path
  // below, exactly as before this PR series. Best-effort: a resolver throw is
  // treated as head so a transient read error never blocks the green recovery.
  if (version.verification_state === "verifying") {
    let isHead = true;
    try {
      isHead = (await opts?.resolveIsHeadVersion?.()) !== false;
    } catch {
      isHead = true;
    }
    if (isHead) {
      let latestGateGreen = false;
      try {
        latestGateGreen = (await opts?.resolveLatestGateGreen?.()) === true;
      } catch {
        latestGateGreen = false;
      }
      if (latestGateGreen) {
        // Codex P1 (#518): don't just no-op a proven-green head row — that traded
        // a false-red for permanent limbo (`/version-status` never reaches
        // `done`, F3-readiness/deploy stays blocked, resume ignores it). TRY a
        // guarded, lease-safe promotion so the row can reach a terminal
        // `promoted`/`passed` state. The caller's `promoteReconciledVersion` uses
        // the guarded, lease-gated `promoteVersionIfUnleased` (promote-guard +
        // no-active-lease + still-`verifying`), so this can never false-green a
        // blocked/leased/already-settled row.
        let reconciled: Version | "guard_denied" | null = null;
        if (opts?.promoteReconciledVersion) {
          try {
            reconciled = await opts.promoteReconciledVersion();
          } catch {
            reconciled = null;
          }
        }
        // A real promoted Version → terminal done direction.
        if (reconciled && reconciled !== "guard_denied") {
          return { version: reconciled, failed: false };
        }
        // Codex P1b (round 2): an EXPLICIT guard denial means the promote-guard's
        // telemetry is a FRESHER truth than the stale gate log — the row is
        // actually blocked, so DON'T protect it. Fall through to the terminal-fail
        // path so it settles instead of spinning forever. Any other result
        // (`null`: no callback / indeterminate / lease held / lock timeout / no
        // longer `verifying`) stays a retryable no-op (next sweep retries).
        if (reconciled !== "guard_denied") {
          return { version, failed: false };
        }
      }
    }
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
