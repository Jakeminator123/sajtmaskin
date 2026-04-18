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

/**
 * Decide whether to run async server-verify after finalize.
 *
 * Simplified 2026-04: the post-finalize verify lane is now driven primarily
 * by `previewPolicy === "fidelity3"`. F2 generations skip the async verify
 * unless quality-gate already produced non-blocking warnings or this is a
 * repair pass. The earlier multi-OR signal heuristic (buildIntent/app,
 * contextPolicy/heavy, changeScope/integration etc.) was redundant once
 * F3 became an explicit lifecycle stage instead of an auto-promoted policy.
 */
export function resolvePostFinalizeServerVerifyDecision(params: {
  buildSpec: BuildSpec;
  finalized: FinalizeResult;
  repairPassIndex?: number;
}): { run: boolean; reason: string } {
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
  if (finalized.preflight.verificationBlocked) {
    return { run: false, reason: "verification_blocked" };
  }

  const previewStart = getPostFinalizePreviewStartContract(finalized);
  const hasNonBlockingWarnings = previewStart.issueCounts.non_blocking_quality_warning > 0;

  if (
    buildSpec.previewPolicy === "fidelity3" ||
    repairPassIndex > 0 ||
    hasNonBlockingWarnings
  ) {
    return { run: true, reason: "policy_match" };
  }

  return { run: false, reason: "design_preview_skip_verify" };
}
