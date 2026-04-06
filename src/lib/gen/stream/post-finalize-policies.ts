import type { BuildSpec } from "@/lib/gen/build-spec";
import { shouldRunOwnEngineSandbox } from "@/lib/gen/sandbox/own-engine-sandbox-gate";
import type { FinalizeResult } from "@/lib/gen/stream/finalize-version";
import type { PreviewStartContract } from "@/lib/gen/stream/preflight-contract";
import { isServerVerifyEligible } from "@/lib/gen/server-verify";
import { isTier2PreviewConfigured } from "@/lib/gen/sandbox/tier2-config";

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
  return shouldRunOwnEngineSandbox({
    isSandboxConfigured: isTier2PreviewConfigured(),
    sandbox: getPostFinalizePreviewStartContract(params.finalized),
    parsedFileCount: params.parsedFileCount,
  });
}

export function shouldTriggerPostFinalizeServerVerify(params: {
  buildSpec: BuildSpec;
  finalized: FinalizeResult;
}): boolean {
  return resolvePostFinalizeServerVerifyDecision(params).run;
}

export function resolvePostFinalizeServerVerifyDecision(params: {
  buildSpec: BuildSpec;
  finalized: FinalizeResult;
}): { run: boolean; reason: string } {
  const { buildSpec, finalized } = params;
  if (buildSpec.verificationPolicy === "fast") {
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
  const isHighSignalFlow =
    buildSpec.verificationPolicy === "strict" ||
    buildSpec.previewPolicy === "fidelity3" ||
    buildSpec.qualityTarget !== "standard" ||
    buildSpec.buildIntent === "app" ||
    buildSpec.contextPolicy === "heavy" ||
    buildSpec.changeScope === "integration" ||
    buildSpec.changeScope === "page-addition" ||
    (buildSpec.generationMode === "followUp" && buildSpec.changeScope === "redesign") ||
    hasNonBlockingWarnings;

  if (!isHighSignalFlow) {
    return { run: false, reason: "low_risk_standard_flow" };
  }

  return { run: true, reason: "policy_match" };
}
