/**
 * Promotion invariant guard (false-green hardening).
 *
 * Invariant: a version must NOT reach `releaseState: "promoted"` while the
 * finalize-time quality gate (recorded as `generation_telemetry.quality_gate_result`)
 * says the verifier or preflight blocked it. Before this guard, the promote
 * decision read only the VM build gate (tsc/eslint/build) — so a row the
 * finalize verifier-LLM rejected (`verifier_failed`) could still be promoted
 * and stamped `verified`, masking the failure (the false-green bug).
 *
 * Scope (intentionally narrow): this only adds a refusal at the promote
 * chokepoint. It does NOT decouple `verificationState`/`releaseState` or
 * rework the status model — that is a separate follow-up.
 */

import { getLatestQualityGateResultForVersion } from "./services/generation-telemetry";

/**
 * Finalize quality-gate results that must block promotion. `preflight_passed`
 * is the only allowing value; anything else that is one of these blocks.
 */
export const PROMOTE_BLOCKING_QUALITY_GATE_RESULTS = [
  "verifier_failed",
  "preflight_failed",
] as const;

export type PromoteGuardDecision =
  | { allowed: true }
  | { allowed: false; signal: string; reason: string }
  // `indeterminate` = the guard could not READ the finalize signal (e.g. a DB
  // error), so it cannot prove the version is clean. Distinct from an explicit
  // block: callers that opt into fail-closed should treat this as "do not
  // promote, but the row is NOT verifier-rejected" (retryable, not terminal).
  | { allowed: false; indeterminate: true; reason: string };

/** Injectable signal reader (defaults to telemetry). Eases unit testing. */
export type QualityGateSignalReader = (versionId: string) => Promise<string | null>;

/** Behaviour when the finalize signal read throws (e.g. DB unavailable). */
export type PromoteGuardOptions = {
  /**
   * `"allow"` (default) keeps the historic fail-open: a read error ALLOWS
   * promotion (so no-telemetry flows — template import, rollback drafts, older
   * rows — are never broken). `"indeterminate"` fails closed instead: a read
   * error returns an `indeterminate` decision so the caller can refuse to
   * promote on an unprovable signal. Opt-in per call site so the canonical
   * `promoteVersion`/`acceptRepair` paths keep their back-compat default while
   * the `/quality-gate` route hardens to fail-closed.
   */
  onReadError?: "allow" | "indeterminate";
};

/**
 * Decide whether `versionId` may be promoted.
 *
 * Default (no `opts`): fail-open. If the signal cannot be read (e.g. DB not
 * configured) or no telemetry row exists, the guard ALLOWS promotion. It only
 * ENGAGES on an explicit blocking signal — so flows without telemetry (template
 * import, rollback drafts, older rows) are never broken by this guard.
 *
 * Fail-closed opt-in (`{ onReadError: "indeterminate" }`): a read ERROR returns
 * `{ allowed: false, indeterminate: true }` instead of allowing, so a transient
 * DB/guard failure can no longer false-green a `verifier_failed` version into
 * `promoted`. A `null` (no telemetry row) is NOT an error and still allows —
 * the back-compat path is unchanged regardless of this option.
 */
export async function assertPromoteAllowed(
  versionId: string,
  readSignal: QualityGateSignalReader = getLatestQualityGateResultForVersion,
  opts?: PromoteGuardOptions,
): Promise<PromoteGuardDecision> {
  let signal: string | null = null;
  try {
    signal = await readSignal(versionId);
  } catch (err) {
    if (opts?.onReadError === "indeterminate") {
      return {
        allowed: false,
        indeterminate: true,
        reason: `promote guard signal unavailable: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
    return { allowed: true };
  }

  if (signal && (PROMOTE_BLOCKING_QUALITY_GATE_RESULTS as readonly string[]).includes(signal)) {
    return {
      allowed: false,
      signal,
      reason: `finalize quality gate = ${signal}`,
    };
  }

  return { allowed: true };
}
