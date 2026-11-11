/**
 * Projektionerna av kvalitetsgrindens typade utfall: varje `kind` ger exakt ett
 * HTTP-svar (status + body i fältordning) och ett kedjeutfall. Hela körningen
 * låses i `quality-gate-contract.test.ts`; här prövas projektionerna isolerat.
 */
import { describe, expect, it } from "vitest";
import { QUALITY_GATE_SETUP_HINT, type QualityGateCheckResult } from "../preview-quality-gate";
import { qualityGateHttpResponse } from "./quality-gate-http";
import {
  verificationOutcomeFromQualityGate,
  type F3ReadinessHold,
  type QualityGateEvidence,
  type QualityGateOutcome,
  type QualityGateOutcomeKind,
} from "./quality-gate-outcome";

const check = (name: string, passed: boolean): QualityGateCheckResult => ({
  check: name,
  passed,
  exitCode: passed ? 0 : 2,
  output: passed ? "" : "error",
});
const evidence = (passed: boolean): QualityGateEvidence => ({
  passed,
  checks: [check("typecheck", passed)],
  verifyLaneDurationMs: 42,
  firstFailureCheck: passed ? null : "typecheck",
  jobStartedAt: "start",
  jobFinishedAt: "finish",
});
const ev = (passed: boolean) => ({
  passed,
  checks: [check("typecheck", passed)],
  verifyLaneDurationMs: 42,
  firstFailureCheck: passed ? null : "typecheck",
  jobStartedAt: "start",
  jobFinishedAt: "finish",
});
const noAdvisories = { designTypecheck: null, host: [] };
const stop = (reason: string, retryable: boolean, vmGatePassed = false) =>
  ({ kind: "stop", reason, retryable, vmGatePassed, promoted: false });
const f3 = (readiness: F3ReadinessHold): QualityGateOutcome =>
  ({ kind: "f3_not_ready", parentVersionId: "ver-f2", projectId: "project-1", readiness });
const SUPERSEDED = { kind: "superseded", cause: "newer_version", forceBuildCheck: false, contextRetryUsed: false };

type Case = [name: string, outcome: QualityGateOutcome, status: number, body: Record<string, unknown>, chain: Record<string, unknown>];

const cases: Case[] = [
  ["snapshot_unavailable", { kind: "snapshot_unavailable" }, 503,
    { code: "snapshot_unavailable", retryable: true }, stop("snapshot_unavailable", true)],
  ["integrations_version_required", { kind: "integrations_version_required" }, 409,
    { error: "ReleaseGate requires an F3 integrations version.", code: "integrations_version_required" },
    stop("integrations_version_required", false)],
  ["readiness_context_unavailable", { kind: "readiness_context_unavailable", code: "readiness_unavailable" }, 503,
    { code: "readiness_unavailable", retryable: true }, stop("readiness_unavailable", true)],
  ["no_files", { kind: "no_files" }, 404, { error: "No files found for version" }, stop("No files found for version", false)],
  ["disabled_by_env", { kind: "disabled_by_env" }, 200, {
    passed: false, skipped: true, disabled: true, promoted: false, checks: [],
    reason: "Quality gate avstängd via SAJTMASKIN_DISABLE_QUALITY_GATE — versionen lämnas overifierad (ingen verify-körning, ingen promotion).",
  }, stop("quality_gate_disabled", false)],
  ["f3_not_ready: missing_env",
    f3({ ready: false, ok: false, reason: "missing_env", retryable: false, spec: {} as never,
      readiness: { missingByIntegration: { stripe: ["STRIPE_SECRET_KEY"] } } as never }),
    412, { error: "tier3_env_not_ready", ready: false, parentVersionId: "ver-f2", projectId: "project-1",
      missingByIntegration: { stripe: ["STRIPE_SECRET_KEY"] } }, stop("tier3_env_not_ready", false)],
  ["f3_not_ready: product postcheck",
    f3({ ready: false, ok: false, reason: "product_postcheck_pending", verdict: "pending", retryable: true }),
    409, { error: "product_postcheck_pending", ready: false, parentVersionId: "ver-f2", verdict: "pending", retryable: true },
    stop("product_postcheck_pending", true)],
  ["f3_not_ready: parent missing",
    f3({ ready: false, ok: false, reason: "f3_parent_version_missing", retryable: false }),
    409, { error: "Integrationsversionen saknar sin designversion.", code: "f3_parent_version_missing", ready: false,
      parentVersionId: "ver-f2", retryable: false }, stop("f3_parent_version_missing", false)],
  ["f3_not_ready: readiness unavailable",
    f3({ ready: false, ok: false, reason: "readiness_unavailable", retryable: true }),
    503, { error: "F3 readiness unavailable (database error). Try again shortly.", code: "readiness_unavailable",
      ready: false, parentVersionId: "ver-f2", retryable: true }, stop("readiness_unavailable", true)],
  ["f3_not_ready: övrigt",
    f3({ ready: false, ok: false, reason: "preview_not_ready", retryable: true }),
    409, { error: "preview_not_ready", ready: false, parentVersionId: "ver-f2", retryable: true }, stop("preview_not_ready", true)],
  ["superseded tidigt", { kind: "superseded", evidence: null }, 200,
    { passed: false, superseded: true, promoted: false, checks: [] }, SUPERSEDED],
  ["superseded sent", { kind: "superseded", evidence: evidence(true) }, 200,
    { ...ev(true), passed: false, superseded: true, promoted: false }, SUPERSEDED],
  ["not_configured utan värdfel", { kind: "not_configured", hostError: null }, 501,
    { error: "Quality gate not configured (missing preview-host verify lane).", code: "quality_gate_disabled", hint: QUALITY_GATE_SETUP_HINT },
    stop("quality_gate_disabled", false)],
  ["not_configured med värdfel", { kind: "not_configured", hostError: "no lane" }, 501,
    { error: "no lane", code: "quality_gate_disabled", retryable: false, hint: QUALITY_GATE_SETUP_HINT },
    stop("quality_gate_disabled", false)],
  ["verify_lane_unavailable: 503 är alltid retrybar för kedjan",
    { kind: "verify_lane_unavailable", message: "down", retryable: false }, 503,
    { error: "down", code: "quality_gate_unavailable", retryable: false, hint: QUALITY_GATE_SETUP_HINT },
    stop("quality_gate_unavailable", true)],
  ["precheck_failed", { kind: "precheck_failed" }, 503,
    { error: "Quality gate pre-checks failed before verification started. Try again shortly.", code: "quality_gate_unavailable", retryable: true },
    stop("quality_gate_unavailable", true)],
  ["time_budget_exceeded", { kind: "time_budget_exceeded" }, 503,
    { code: "time_budget_exceeded", retryable: true, passed: false, promoted: false }, stop("time_budget_exceeded", true)],
  ["promoted", { kind: "promoted", filesRevision: "rev-1", evidence: evidence(true), advisories: noAdvisories }, 200,
    { ...ev(true), promoted: true },
    { kind: "continue", filesRevision: "rev-1", vmGatePassed: true, promoted: true, advisory: false }],
  ["promoted med värdens advisory",
    { kind: "promoted", filesRevision: "rev-1", evidence: evidence(true), advisories: { designTypecheck: null, host: ["lint"] } }, 200,
    { ...ev(true), promoted: true, qualityGateAdvisory: true, advisoryChecks: ["lint"] },
    { kind: "continue", filesRevision: "rev-1", vmGatePassed: true, promoted: true, advisory: true }],
  ["promoted som F2-advisory",
    { kind: "promoted", filesRevision: "rev-1", evidence: evidence(false), advisories: { designTypecheck: ["typecheck"], host: [] } }, 200,
    { ...ev(false), passed: true, vmGatePassed: false, designAdvisory: true, advisoryChecks: ["typecheck"], promoted: true },
    { kind: "continue", filesRevision: "rev-1", vmGatePassed: false, promoted: true, advisory: true }],
  ["failed", { kind: "failed", evidence: evidence(false), hostAdvisories: [] }, 200,
    { ...ev(false), promoted: false }, stop("quality_gate_failed", false)],
  ["failed med värdens advisory", { kind: "failed", evidence: evidence(false), hostAdvisories: ["lint"] }, 200,
    { ...ev(false), promoted: false, qualityGateAdvisory: true, advisoryChecks: ["lint"] }, stop("quality_gate_failed", false)],
  ["promotion_blocked", { kind: "promotion_blocked", evidence: evidence(true) }, 200,
    { ...ev(true), passed: false, vmGatePassed: true, promotionBlocked: true,
      promotionBlockedReason: "finalize_quality_gate_failed", promoted: false },
    stop("promotion_blocked", false, true)],
  ["promotion_deferred: guard otillgänglig utan värdens advisory",
    { kind: "promotion_deferred", cause: "guard_unavailable", evidence: evidence(false),
      advisories: { designTypecheck: ["typecheck"], host: ["lint"] } }, 200,
    { ...ev(false), vmGatePassed: false, promoteError: true, promoteGuardUnavailable: true, promoted: false,
      designAdvisory: true, advisoryChecks: ["typecheck"] },
    stop("promotion_deferred", true)],
  ["promotion_deferred: promotionen tog inte, värdens lista skriver över",
    { kind: "promotion_deferred", cause: "promote_failed", evidence: evidence(false),
      advisories: { designTypecheck: ["typecheck"], host: ["lint"] } }, 200,
    { ...ev(false), vmGatePassed: false, promoteError: true, promoted: false, designAdvisory: true,
      advisoryChecks: ["lint"], qualityGateAdvisory: true },
    stop("promotion_deferred", true)],
  ["integration_migration_required", { kind: "integration_migration_required", vmGatePassed: true }, 409,
    { error: "Versionen innehåller ett providerbyte som måste granskas innan den kan markeras klar.",
      code: "integration_migration_required", retryable: false, passed: false, vmGatePassed: true, promoted: false },
    stop("integration_migration_required", false, true)],
];

describe("kvalitetsgrindens projektioner", () => {
  it.each(cases)("%s", (_name, outcome, status, body, chain) => {
    const http = qualityGateHttpResponse(outcome);
    expect(http.status).toBe(status);
    expect(JSON.stringify(http.body)).toBe(JSON.stringify(body));
    expect(verificationOutcomeFromQualityGate(outcome)).toStrictEqual(chain);
  });

  it("täcker varje kind", () => {
    const all: Record<QualityGateOutcomeKind, true> = {
      snapshot_unavailable: true, integrations_version_required: true, readiness_context_unavailable: true,
      no_files: true, disabled_by_env: true, f3_not_ready: true, superseded: true, not_configured: true,
      verify_lane_unavailable: true, precheck_failed: true, time_budget_exceeded: true, promoted: true,
      failed: true, promotion_blocked: true, promotion_deferred: true, integration_migration_required: true,
    };
    expect(new Set(cases.map(([, outcome]) => outcome.kind))).toEqual(new Set(Object.keys(all)));
  });
});
