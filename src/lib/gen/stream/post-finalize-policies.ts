import type { BuildSpec } from "@/lib/gen/build-spec";
import { shouldRunOwnEngineSandbox } from "@/lib/gen/sandbox/own-engine-sandbox-gate";
import type { FinalizeResult } from "@/lib/gen/stream/finalize-version";
import type { SandboxStartContract } from "@/lib/gen/stream/preflight-contract";
import { isServerVerifyEligible } from "@/lib/gen/server-verify";
import { isSandboxConfigured } from "@/lib/mcp/runtime-url";

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
    isSandboxConfigured: isSandboxConfigured(),
    sandbox: getPostFinalizeSandboxContract(params.finalized),
    parsedFileCount: params.parsedFileCount,
  });
}

export function shouldTriggerPostFinalizeServerVerify(params: {
  buildSpec: BuildSpec;
  finalized: FinalizeResult;
}): boolean {
  const { buildSpec, finalized } = params;
  if (buildSpec.verificationPolicy === "fast") return false;
  return (
    isServerVerifyEligible(finalized.version.id) &&
    !finalized.preflight.previewBlocked &&
    !finalized.preflight.verificationBlocked
  );
}
