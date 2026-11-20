/**
 * HTTP projection of the quality gate outcome for
 * `POST /api/engine/chats/[chatId]/quality-gate`. Field order is part of the
 * contract (`quality-gate-contract.test.ts` compares the JSON byte for byte):
 * evidence first, then the outcome flags, advisory fields last.
 */
import { QUALITY_GATE_SETUP_HINT, type QualityGateCheckResult } from "../preview-quality-gate";
import type { VisualQAResult } from "../visual-qa";
import type { F3ReadinessHold, QualityGateAdvisories, QualityGateOutcome } from "./quality-gate-outcome";

type MissingEnvHold = Extract<F3ReadinessHold, { reason: "missing_env" }>;
type ProductPostcheckHold = Extract<F3ReadinessHold, { verdict: unknown }>;

export type QualityGateHttpBody = {
  error?: string;
  code?: string;
  ready?: false;
  parentVersionId?: string | null;
  projectId?: string | null;
  missingByIntegration?: MissingEnvHold["readiness"]["missingByIntegration"];
  verdict?: ProductPostcheckHold["verdict"];
  retryable?: boolean;
  hint?: string;
  passed?: boolean;
  checks?: QualityGateCheckResult[];
  verifyLaneDurationMs?: number;
  firstFailureCheck?: string | null;
  jobStartedAt?: string | null;
  jobFinishedAt?: string | null;
  visualQA?: VisualQAResult;
  skipped?: true;
  disabled?: true;
  reason?: string;
  superseded?: true;
  vmGatePassed?: boolean;
  promotionBlocked?: true;
  promotionBlockedReason?: "finalize_quality_gate_failed";
  promoteError?: true;
  promoteGuardUnavailable?: true;
  designAdvisory?: true;
  qualityGateAdvisory?: true;
  advisoryChecks?: string[];
  promoted?: boolean;
};

export type QualityGateHttpResponse = { body: QualityGateHttpBody; status: number };

const NOT_CONFIGURED_MESSAGE = "Quality gate not configured (missing preview-host verify lane).";

function respond(body: QualityGateHttpBody, status = 200): QualityGateHttpResponse {
  return { body, status };
}

function designAdvisoryFields(advisories: QualityGateAdvisories): QualityGateHttpBody {
  return advisories.designTypecheck !== null
    ? { designAdvisory: true, advisoryChecks: advisories.designTypecheck }
    : {};
}

/** When both apply, the host list overwrites `advisoryChecks` while the key keeps its place. */
function hostAdvisoryFields(host: string[]): QualityGateHttpBody {
  return host.length > 0 ? { qualityGateAdvisory: true, advisoryChecks: host } : {};
}

function f3NotReadyResponse(outcome: Extract<QualityGateOutcome, { kind: "f3_not_ready" }>): QualityGateHttpResponse {
  const { readiness, parentVersionId } = outcome;
  switch (readiness.reason) {
    case "missing_env":
      return respond({
        error: "tier3_env_not_ready",
        ready: false,
        parentVersionId,
        projectId: outcome.projectId,
        missingByIntegration: readiness.readiness.missingByIntegration,
      }, 412);
    case "product_postcheck_blocked":
    case "product_postcheck_pending":
    case "product_postcheck_indeterminate":
    case "product_postcheck_superseded":
      return respond({
        error: readiness.reason,
        ready: false,
        parentVersionId,
        verdict: readiness.verdict,
        retryable: readiness.retryable === true,
      }, 409);
    case "f3_parent_version_missing":
      return respond({
        error: "Integrationsversionen saknar sin designversion.",
        code: "f3_parent_version_missing",
        ready: false,
        parentVersionId,
        retryable: false,
      }, 409);
    case "readiness_unavailable":
      return respond({
        error: "F3 readiness unavailable (database error). Try again shortly.",
        code: "readiness_unavailable",
        ready: false,
        parentVersionId,
        retryable: true,
      }, 503);
    default:
      return respond({
        error: readiness.reason,
        ready: false,
        parentVersionId,
        retryable: readiness.retryable === true,
      }, 409);
  }
}

export function qualityGateHttpResponse(outcome: QualityGateOutcome): QualityGateHttpResponse {
  switch (outcome.kind) {
    case "snapshot_unavailable":
      return respond({ code: "snapshot_unavailable", retryable: true }, 503);
    case "integrations_version_required":
      return respond({ error: "ReleaseGate requires an F3 integrations version.", code: "integrations_version_required" }, 409);
    case "readiness_context_unavailable":
      return respond({ code: outcome.code, retryable: true }, 503);
    case "no_files":
      return respond({ error: "No files found for version" }, 404);
    case "disabled_by_env":
      return respond({
        passed: false,
        skipped: true,
        disabled: true,
        promoted: false,
        checks: [],
        reason:
          "Quality gate avstängd via SAJTMASKIN_DISABLE_QUALITY_GATE — versionen lämnas overifierad (ingen verify-körning, ingen promotion).",
      });
    case "f3_not_ready":
      return f3NotReadyResponse(outcome);
    case "superseded":
      // Like the early lane, a superseded verdict never counts as a pass.
      return outcome.evidence === null
        ? respond({ passed: false, superseded: true, promoted: false, checks: [] })
        : respond({ ...outcome.evidence, passed: false, superseded: true, promoted: false });
    case "not_configured":
      return outcome.hostError === null
        ? respond({ error: NOT_CONFIGURED_MESSAGE, code: "quality_gate_disabled", hint: QUALITY_GATE_SETUP_HINT }, 501)
        : respond({ error: outcome.hostError, code: "quality_gate_disabled", retryable: false, hint: QUALITY_GATE_SETUP_HINT }, 501);
    case "verify_lane_unavailable":
      return respond({
        error: outcome.message,
        code: "quality_gate_unavailable",
        retryable: outcome.retryable,
        hint: QUALITY_GATE_SETUP_HINT,
      }, 503);
    case "precheck_failed":
      return respond({
        error: "Quality gate pre-checks failed before verification started. Try again shortly.",
        code: "quality_gate_unavailable",
        retryable: true,
      }, 503);
    case "time_budget_exceeded":
      return respond({ code: "time_budget_exceeded", retryable: true, passed: false, promoted: false }, 503);
    case "integration_migration_required":
      return respond({
        error: "Versionen innehåller ett providerbyte som måste granskas innan den kan markeras klar.",
        code: "integration_migration_required",
        retryable: false,
        passed: false,
        vmGatePassed: outcome.vmGatePassed,
        promoted: false,
      }, 409);
    case "promotion_blocked":
      // `vmGatePassed` keeps the VM status for diagnostics; `passed: false`
      // tells callers that only read `passed` the truth.
      return respond({
        ...outcome.evidence,
        passed: false,
        vmGatePassed: outcome.evidence.passed,
        promotionBlocked: true,
        promotionBlockedReason: "finalize_quality_gate_failed",
        promoted: false,
      });
    case "promotion_deferred":
      // `promoteError` reuses the client's retry UX. The guard-unavailable
      // variant carries the design advisory but not the host's.
      return outcome.cause === "guard_unavailable"
        ? respond({
            ...outcome.evidence,
            passed: false,
            vmGatePassed: outcome.evidence.passed,
            promoteError: true,
            promoteGuardUnavailable: true,
            promoted: false,
            ...designAdvisoryFields(outcome.advisories),
          })
        : respond({
            ...outcome.evidence,
            passed: false,
            vmGatePassed: outcome.evidence.passed,
            promoteError: true,
            promoted: false,
            ...designAdvisoryFields(outcome.advisories),
            ...hostAdvisoryFields(outcome.advisories.host),
          });
    case "promoted":
      // F2 render-first: `passed: true` so the client does not auto-repair,
      // `vmGatePassed: false` so no consumer reads it as a solid-green build.
      return outcome.advisories.designTypecheck !== null
        ? respond({
            ...outcome.evidence,
            passed: true,
            vmGatePassed: false,
            designAdvisory: true,
            advisoryChecks: outcome.advisories.designTypecheck,
            promoted: true,
            ...hostAdvisoryFields(outcome.advisories.host),
          })
        : respond({ ...outcome.evidence, promoted: true, ...hostAdvisoryFields(outcome.advisories.host) });
    case "failed":
      return respond({ ...outcome.evidence, promoted: false, ...hostAdvisoryFields(outcome.hostAdvisories) });
  }
}
