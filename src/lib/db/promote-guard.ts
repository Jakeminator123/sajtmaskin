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
  | { allowed: false; signal: string; reason: string };

/** Injectable signal reader (defaults to telemetry). Eases unit testing. */
export type QualityGateSignalReader = (versionId: string) => Promise<string | null>;

/**
 * Decide whether `versionId` may be promoted.
 *
 * Fail-open: if the signal cannot be read (e.g. DB not configured) or no
 * telemetry row exists, the guard ALLOWS promotion. It only ENGAGES on an
 * explicit blocking signal — so flows without telemetry (template import,
 * rollback drafts, older rows) are never broken by this guard.
 */
export async function assertPromoteAllowed(
  versionId: string,
  readSignal: QualityGateSignalReader = getLatestQualityGateResultForVersion,
): Promise<PromoteGuardDecision> {
  let signal: string | null = null;
  try {
    signal = await readSignal(versionId);
  } catch {
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
