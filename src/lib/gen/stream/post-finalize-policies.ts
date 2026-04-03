import type { BuildSpec } from "@/lib/gen/build-spec";
import { shouldRunOwnEngineSandbox } from "@/lib/gen/sandbox/own-engine-sandbox-gate";
import type { FinalizeResult } from "@/lib/gen/stream/finalize-version";
import type { SandboxStartContract } from "@/lib/gen/stream/preflight-contract";
import { isServerVerifyEligible } from "@/lib/gen/server-verify";
import { isTier2PreviewConfigured } from "@/lib/gen/sandbox/tier2-config";

export function getPostFinalizeSandboxContract(
  finalized: FinalizeResult,
): SandboxStartContract {
  return finalized.preflight.sandbox ?? {
    canStartSandbox: false,
    primaryPreviewTarget: "none",
    shimBlocked: false,
    requiresEnvConfig: false,
    hasCriticalInstallRisk: false,
    hasCriticalCodeFailure: false,
    compatibilityShimAllowed: false,
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

export function shouldTriggerPostFinalizeSandbox(params: {
  finalized: FinalizeResult;
  parsedFileCount: number;
}): boolean {
  return shouldRunOwnEngineSandbox({
    isSandboxConfigured: isTier2PreviewConfigured(),
    sandbox: getPostFinalizeSandboxContract(params.finalized),
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

  const sandbox = getPostFinalizeSandboxContract(finalized);
  const hasNonBlockingWarnings = sandbox.issueCounts.non_blocking_quality_warning > 0;
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
