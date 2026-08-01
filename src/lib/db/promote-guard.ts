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
 * Innehållsrevision steg 3 (flagga `SAJTMASKIN_CONTENT_REVISION_GATE`) lägger till
 * den andra halvan: ett verdikt gäller ett INNEHÅLL, inte ett `versionId`. Bär
 * verdiktet en revision som bevisligen inte är innehållets är det inget svar —
 * symmetriskt, både `passed` och `failed` (planens beslut 1a) — och versionen
 * räknas som overifierad tills en gate körts för det nya innehållet (beslut 1b).
 * Saknas revisionen är läget okänt och guarden är fail-open precis som förut.
 *
 * Scope (intentionally narrow): this only adds a refusal at the promote
 * chokepoint. It does NOT decouple `verificationState`/`releaseState` or
 * rework the status model — that is a separate follow-up.
 */

import {
  getLatestQualityGateSignalForVersion,
  type QualityGateSignal,
} from "./services/generation-telemetry";
import { shortRevision } from "@/lib/gen/verify/content-revision";
import { incContentRevisionMismatch } from "@/lib/observability/metrics";

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
  // `indeterminate` = the guard could not obtain a verdict that applies to the
  // content being promoted — either the finalize signal could not be READ (e.g. a
  // DB error) or (revision gate on) the only signal describes a DIFFERENT content
  // revision. Distinct from an explicit block: callers that opt into fail-closed
  // should treat this as "do not promote, but the row is NOT verifier-rejected"
  // (retryable, not terminal).
  | {
      allowed: false;
      indeterminate: true;
      reason: string;
      /** Set when the indeterminacy is a KNOWN revision mismatch, not a read error. */
      staleRevision?: true;
    };

/**
 * Injectable signal reader (defaults to telemetry). Eases unit testing.
 *
 * A plain `string | null` is still accepted (and treated as an unknown-revision
 * signal, i.e. today's semantics) so existing call sites and tests that inject a
 * simple verdict keep working.
 */
export type QualityGateSignalReader = (
  versionId: string,
) => Promise<string | null | QualityGateSignal>;

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
  /**
   * The exact `files_json` about to be promoted when it is NOT what the version
   * row currently holds. Only `acceptRepair` needs it: it promotes the content
   * from `repaired_files_json` in the same transaction, so comparing against the
   * version's current (pre-accept) revision would call the repair verdict stale.
   * Same explicit pattern as `assessedFilesJson` (#646) — compare against the
   * content the verdict actually describes, never re-stamp the receipt.
   */
  promotedFilesJson?: string | null;
};

function normalizeSignal(raw: string | null | QualityGateSignal): QualityGateSignal {
  if (raw === null || typeof raw === "string") {
    return {
      result: raw,
      revisionMatch: "unknown",
      verdictRevision: null,
      contentRevision: null,
    };
  }
  return raw;
}

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
 *
 * Known revision mismatch (gate on) is ALWAYS retryable-indeterminate,
 * independent of `onReadError`: we know the content changed and that no gate has
 * seen the new content, so promoting would be a false-green with a known cause —
 * while terminal-failing would invent a verdict nobody produced.
 */
export async function assertPromoteAllowed(
  versionId: string,
  readSignal?: QualityGateSignalReader,
  opts?: PromoteGuardOptions,
): Promise<PromoteGuardDecision> {
  let signal: QualityGateSignal;
  try {
    signal = normalizeSignal(
      readSignal
        ? await readSignal(versionId)
        : await getLatestQualityGateSignalForVersion(versionId, {
            promotedFilesJson: opts?.promotedFilesJson ?? null,
          }),
    );
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

  if (signal.revisionMatch === "stale") {
    incContentRevisionMismatch("promote_guard", { verdict: signal.result });
    return {
      allowed: false,
      indeterminate: true,
      staleRevision: true,
      reason:
        `promote guard signal describes another content revision ` +
        `(verdikt ${shortRevision(signal.verdictRevision)} = ${signal.result ?? "inget"}, ` +
        `innehåll ${shortRevision(signal.contentRevision)}) — kör gaten igen`,
    };
  }

  if (
    signal.result &&
    (PROMOTE_BLOCKING_QUALITY_GATE_RESULTS as readonly string[]).includes(signal.result)
  ) {
    return {
      allowed: false,
      signal: signal.result,
      reason: `finalize quality gate = ${signal.result}`,
    };
  }

  return { allowed: true };
}
