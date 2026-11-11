/**
 * The quality gate's domain outcome, decided under the lease before any
 * response exists. The HTTP route and the postcheck chain are two projections
 * of it (`qualityGateHttpResponse` and `verificationOutcomeFromQualityGate`).
 */
import type { VisualQAResult } from "../visual-qa";
import type { QualityGateCheckResult } from "../preview-quality-gate";
import type { Tier3ReadinessResult } from "../tier3-readiness";
import type { VersionVerificationOutcome } from "./verify-run";

/** What the verify lane measured, in the order the response carries it. */
export type QualityGateEvidence = {
  passed: boolean;
  checks: QualityGateCheckResult[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  visualQA?: VisualQAResult;
};

export type QualityGateAdvisories = {
  /** F2 render-first: failing checks when typecheck is the only failure; null otherwise. */
  designTypecheck: string[] | null;
  /** Checks the host itself reported as advisory (lint warnings). */
  host: string[];
};

export type F3ReadinessHold = Extract<Tier3ReadinessResult, { ready: false }>;

export type QualityGateOutcome =
  // The lane never started; the version is untouched.
  | { kind: "snapshot_unavailable" }
  | { kind: "integrations_version_required" }
  | { kind: "readiness_context_unavailable"; code: "readiness_unavailable" }
  | { kind: "no_files" }
  | { kind: "disabled_by_env" }
  | { kind: "f3_not_ready"; parentVersionId: string | null; projectId: string | null; readiness: F3ReadinessHold }
  /** `evidence` is null when the version was settled before the lane ran. */
  | { kind: "superseded"; evidence: QualityGateEvidence | null }
  // Verification could not be carried out; never a verdict on the code.
  /** `hostError` is the thrown error's message, or null when the lane is simply absent. */
  | { kind: "not_configured"; hostError: string | null }
  | { kind: "verify_lane_unavailable"; message: string; retryable: boolean }
  | { kind: "precheck_failed" }
  | { kind: "time_budget_exceeded" }
  // The lane measured the code.
  | { kind: "promoted"; filesRevision: string; evidence: QualityGateEvidence; advisories: QualityGateAdvisories }
  /** A failed gate never takes the F2 advisory path, so only host advisories can apply. */
  | { kind: "failed"; evidence: QualityGateEvidence; hostAdvisories: string[] }
  | { kind: "promotion_blocked"; evidence: QualityGateEvidence }
  | {
      kind: "promotion_deferred";
      cause: "guard_unavailable" | "promote_failed";
      evidence: QualityGateEvidence;
      advisories: QualityGateAdvisories;
    }
  | { kind: "integration_migration_required"; vmGatePassed: boolean };

export type QualityGateOutcomeKind = QualityGateOutcome["kind"];

function stopped(reason: string, retryable: boolean, vmGatePassed = false): VersionVerificationOutcome {
  return { kind: "stop", reason, retryable, vmGatePassed, promoted: false };
}

/**
 * Chain projection. Every response the route answers with 503 is retryable for
 * the chain, even when the host said `retryable: false`.
 */
export function verificationOutcomeFromQualityGate(outcome: QualityGateOutcome): VersionVerificationOutcome {
  switch (outcome.kind) {
    case "superseded":
      return { kind: "superseded", cause: "newer_version", forceBuildCheck: false, contextRetryUsed: false };
    case "promoted": {
      const design = outcome.advisories.designTypecheck !== null;
      return {
        kind: "continue",
        filesRevision: outcome.filesRevision,
        vmGatePassed: design ? false : outcome.evidence.passed,
        promoted: true,
        advisory: design || outcome.advisories.host.length > 0,
      };
    }
    case "snapshot_unavailable":
      return stopped("snapshot_unavailable", true);
    case "integrations_version_required":
      return stopped("integrations_version_required", false);
    case "readiness_context_unavailable":
      return stopped(outcome.code, true);
    case "no_files":
      // The chain has always carried the message here, not a code.
      return stopped("No files found for version", false);
    case "disabled_by_env":
      return stopped("quality_gate_disabled", false);
    case "f3_not_ready": {
      const { readiness } = outcome;
      return stopped(readiness.reason === "missing_env" ? "tier3_env_not_ready" : readiness.reason, readiness.retryable === true);
    }
    case "not_configured":
      return stopped("quality_gate_disabled", false);
    case "verify_lane_unavailable":
    case "precheck_failed":
      return stopped("quality_gate_unavailable", true);
    case "time_budget_exceeded":
      return stopped("time_budget_exceeded", true);
    case "failed":
      return stopped("quality_gate_failed", false, outcome.evidence.passed);
    case "promotion_blocked":
      return stopped("promotion_blocked", false, outcome.evidence.passed);
    case "promotion_deferred":
      return stopped("promotion_deferred", true, outcome.evidence.passed);
    case "integration_migration_required":
      return stopped("integration_migration_required", false, outcome.vmGatePassed);
  }
}
