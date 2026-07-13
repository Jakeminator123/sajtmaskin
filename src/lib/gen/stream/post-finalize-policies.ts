import type { BuildSpec } from "@/lib/gen/build-spec";
import {
  hasBuildBreakingVerifierFindings,
  shouldStartOwnEnginePreview,
} from "@/lib/gen/preview/should-start-preview";
import type { FinalizeResult } from "@/lib/gen/stream/finalize-version";
import type { PreviewStartContract } from "@/lib/gen/stream/preflight-contract";
import { isServerVerifyEligible } from "@/lib/gen/verify/server-verify";
import { isTier2PreviewConfigured } from "@/lib/gen/preview/tier2-config";
import {
  DESIGN_PREVIEW_QUALITY_GATE_CHECKS,
  INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS,
  type QualityGateCheck,
} from "@/lib/gen/verify/quality-gate-checks";

export function getPostFinalizePreviewStartContract(
  finalized: FinalizeResult,
): PreviewStartContract {
  return finalized.preflight.previewStart ?? {
    canStartPreview: false,
    primaryPreviewTarget: "none",
    shimBlocked: false,
    requiresEnvConfig: false,
    hasCriticalInstallRisk: false,
    hasCriticalCodeFailure: false,
    compatibilityPreviewAllowed: false,
    issueCounts: {
      code_structure_failure: 0,
      dependency_install_failure: 0,
      env_config_missing: 0,
      shim_preview_failure: 0,
      non_blocking_quality_warning: 0,
    },
    blockingCategories: [],
  };
}

export function shouldTriggerPostFinalizePreview(params: {
  finalized: FinalizeResult;
  parsedFileCount: number;
}): boolean {
  return shouldStartOwnEnginePreview({
    isPreviewConfigured: isTier2PreviewConfigured(),
    previewStart: getPostFinalizePreviewStartContract(params.finalized),
    parsedFileCount: params.parsedFileCount,
    verifierHasBuildBreakingFindings: hasBuildBreakingVerifierFindings(
      params.finalized.verifierBlockingFindings,
    ),
  });
}

/**
 * Public reason string surfaced through the SSE `done` event when the
 * post-finalize preview lane refuses to start because of a build-breaking
 * verifier blocker. UI maps this to "Preview blockerad av TypeScript/importfel".
 */
export const VERIFIER_BUILD_BREAKING_PREVIEW_REASON = "verifier-build-breaking" as const;

/**
 * Resolve the preview-blocked envelope used by `runOwnEngineStreamPostFinalize`'s
 * `done` event. Mirrors what `finalized.preflight` already exposes but ORs
 * the verifier build-breaking signal on top so the UI sees a single,
 * coherent block decision.
 */
export function resolvePostFinalizePreviewBlockedState(params: {
  finalized: FinalizeResult;
}): {
  previewBlocked: boolean;
  previewBlockingReason: string | null;
} {
  const verifierBlocked = hasBuildBreakingVerifierFindings(
    params.finalized.verifierBlockingFindings,
  );
  const baselineBlocked = params.finalized.preflight.previewBlocked === true;
  const baselineReason = params.finalized.preflight.previewBlockingReason ?? null;
  if (baselineBlocked) {
    return { previewBlocked: true, previewBlockingReason: baselineReason };
  }
  if (verifierBlocked) {
    return {
      previewBlocked: true,
      previewBlockingReason: VERIFIER_BUILD_BREAKING_PREVIEW_REASON,
    };
  }
  return { previewBlocked: false, previewBlockingReason: baselineReason };
}

export function shouldTriggerPostFinalizeServerVerify(params: {
  buildSpec: BuildSpec;
  finalized: FinalizeResult;
  repairPassIndex?: number;
}): boolean {
  return resolvePostFinalizeServerVerifyDecision(params).run;
}

export function getPostFinalizeQualityGateChecks(
  buildSpec: BuildSpec | null | undefined,
): readonly QualityGateCheck[] {
  if (buildSpec?.previewPolicy === "fidelity3") {
    return INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS;
  }
  return DESIGN_PREVIEW_QUALITY_GATE_CHECKS;
}

export function postFinalizeQualityGateIncludesTypecheck(
  buildSpec: BuildSpec | null | undefined,
): boolean {
  return getPostFinalizeQualityGateChecks(buildSpec).includes("typecheck");
}

export type ServerVerifyDecision = {
  run: boolean;
  reason: string;
  /**
   * When true, server-verify runs only to surface diagnostics — it MUST
   * NOT auto-promote and SHOULD NOT trigger the auto-repair loop.
   * Used when verifier-blocking findings already exist: we still want
   * SSR/build-error visibility (otherwise problems like a missing
   * `usePathname` import in `floating-cta.tsx` stay invisible to
   * `next build` until every other blocker is cleared), but we won't
   * mutate the version under those circumstances.
   */
  diagnosticOnly?: boolean;
};

/**
 * Decide whether to run async server-verify after finalize.
 *
 * Simplified 2026-04: the post-finalize verify lane is now driven primarily
 * by `previewPolicy === "fidelity3"`. F2 generations skip the async verify
 * unless this is a repair pass or a verifier blocker exists. The earlier
 * multi-OR signal heuristic (buildIntent/app, contextPolicy/heavy,
 * changeScope/integration etc.) was redundant once F3 became an explicit
 * lifecycle stage instead of an auto-promoted policy.
 *
 * 2026-04-19: `verificationBlocked` no longer hard-blocks the run — it
 * downgrades it to `diagnosticOnly`. Promotion still requires zero
 * blockers downstream; this only opens up SSR/build-error logging.
 *
 * 2026-07-13 (M#vlane1 — single verify-lane per F2 version): the skip now
 * covers EVERY F2 design round (init AND follow-up) whose preflight surfaced
 * only non-blocking signals, not just init. The client quality-gate route
 * always runs for F2 and owns F2 verify/promotion, so scheduling a second
 * server-owned verify lane on the same version row is redundant. A prod
 * incident (2026-07-13) proved the harm: an F2 follow-up with advisory
 * warnings got a background server-verify lease 12 s apart from the client
 * quality-gate lease on the same version row → row-lock contention →
 * promote-UPDATE died on `statement_timeout` → false-red. Before this,
 * follow-up + advisory reached `run=true` via the (removed) non-blocking
 * warnings OR-branch. `verificationBlocked` (diagnostic-only), F3, and repair
 * passes keep their run contracts unchanged.
 */
export function resolvePostFinalizeServerVerifyDecision(params: {
  buildSpec: BuildSpec;
  finalized: FinalizeResult;
  repairPassIndex?: number;
}): ServerVerifyDecision {
  const { buildSpec, finalized, repairPassIndex = 0 } = params;
  if (buildSpec.verificationPolicy === "fast" && repairPassIndex === 0) {
    return { run: false, reason: "fast_policy" };
  }
  if (!isServerVerifyEligible(finalized.version.id)) {
    return { run: false, reason: "not_eligible" };
  }
  if (finalized.preflight.previewBlocked) {
    return { run: false, reason: "preview_blocked" };
  }

  const previewStart = getPostFinalizePreviewStartContract(finalized);
  const hasNonBlockingWarnings = previewStart.issueCounts.non_blocking_quality_warning > 0;
  const verificationBlocked = finalized.preflight.verificationBlocked === true;
  const preflightErrorCount =
    typeof finalized.preflight.errorCount === "number" && Number.isFinite(finalized.preflight.errorCount)
      ? finalized.preflight.errorCount
      : null;

  // A verifier-blocking finding still runs server-verify, but ONLY to surface
  // diagnostics — it never auto-promotes (enforced in `server-verify.ts`'s
  // `diagnosticOnly` branches). This diagnostics lane is independent of the
  // F2/F3 owner split below.
  if (verificationBlocked) {
    return {
      run: true,
      reason: "diagnostic_only_verification_blocked",
      diagnosticOnly: true,
    };
  }

  // F3 (integrations/ReleaseGate) and any repair pass always run the server
  // verify lane — their contracts are unchanged by the F2 single-lane fix.
  if (buildSpec.previewPolicy === "fidelity3" || repairPassIndex > 0) {
    return { run: true, reason: "policy_match" };
  }

  // M#vlane1: EVERY F2 design round (init AND follow-up) whose preflight
  // surfaced only non-blocking signals skips the background server-verify —
  // the client quality-gate route is the single verify/promotion owner for F2.
  // Counted hard preflight errors (rare in F2, since real blockers usually set
  // previewBlocked/verificationBlocked handled above) still fall through so the
  // server lane can surface them.
  const isFidelity2Design = buildSpec.previewPolicy === "fidelity2";
  const hasBlockingPreflightErrors =
    preflightErrorCount !== null && preflightErrorCount > 0;
  if (isFidelity2Design && !hasBlockingPreflightErrors) {
    return { run: false, reason: "design_preview_skip_verify" };
  }

  // Fallthrough (F2 with counted hard errors, or an unknown preview policy):
  // keep the historic warning-driven run so nothing loses verify coverage.
  if (hasNonBlockingWarnings) {
    return { run: true, reason: "policy_match" };
  }

  return { run: false, reason: "design_preview_skip_verify" };
}
