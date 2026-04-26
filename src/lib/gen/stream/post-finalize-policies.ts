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
 * unless quality-gate already produced non-blocking warnings or this is a
 * repair pass. The earlier multi-OR signal heuristic (buildIntent/app,
 * contextPolicy/heavy, changeScope/integration etc.) was redundant once
 * F3 became an explicit lifecycle stage instead of an auto-promoted policy.
 *
 * 2026-04-19: `verificationBlocked` no longer hard-blocks the run — it
 * downgrades it to `diagnosticOnly`. Promotion still requires zero
 * blockers downstream; this only opens up SSR/build-error logging.
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
  const isFidelity2Init =
    buildSpec.previewPolicy === "fidelity2" && buildSpec.generationMode === "init";
  if (isFidelity2Init && preflightErrorCount === 0 && !verificationBlocked) {
    return { run: false, reason: "design_preview_skip_verify" };
  }

  if (
    buildSpec.previewPolicy === "fidelity3" ||
    repairPassIndex > 0 ||
    hasNonBlockingWarnings ||
    verificationBlocked
  ) {
    if (verificationBlocked) {
      return {
        run: true,
        reason: "diagnostic_only_verification_blocked",
        diagnosticOnly: true,
      };
    }
    return { run: true, reason: "policy_match" };
  }

  return { run: false, reason: "design_preview_skip_verify" };
}
