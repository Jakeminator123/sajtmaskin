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
     * Instead it reconciles by no-op'ing (the version is launchable; a later
     * promote/retry or the next quality-gate call settles it terminally).
     * Best-effort: a throw is swallowed and the normal fail path continues.
     */
    resolveLatestGateGreen?: () => Promise<boolean> | boolean;
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
  // branch — merely left it spinning at `verifying`. No-op instead of writing a
  // false-red `failed`. Best-effort: a resolver throw falls through to the
  // normal fail path so the perpetual-spinner guard still applies.
  let latestGateGreen = false;
  try {
    latestGateGreen = (await opts?.resolveLatestGateGreen?.()) === true;
  } catch {
    latestGateGreen = false;
  }
  if (latestGateGreen) {
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
