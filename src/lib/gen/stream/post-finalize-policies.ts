import type { BuildSpec } from "@/lib/gen/build-spec";
import { shouldStartOwnEnginePreview } from "@/lib/gen/preview/should-start-preview";
import type { FinalizeResult } from "@/lib/gen/stream/finalize-version";
import type { PreviewStartContract } from "@/lib/gen/stream/preflight-contract";
import { isServerVerifyEligible } from "@/lib/gen/verify/server-verify";
import { isTier2PreviewConfigured } from "@/lib/gen/preview/tier2-config";

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
  });
}

export function shouldTriggerPostFinalizeServerVerify(params: {
  buildSpec: BuildSpec;
  finalized: FinalizeResult;
  repairPassIndex?: number;
}): boolean {
  return resolvePostFinalizeServerVerifyDecision(params).run;
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
