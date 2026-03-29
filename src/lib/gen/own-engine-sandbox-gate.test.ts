import { describe, expect, it } from "vitest";
import { shouldRunOwnEngineSandbox } from "./own-engine-sandbox-gate";
import type { SandboxStartContract } from "./preview";

function sandboxContract(overrides?: Partial<SandboxStartContract>): SandboxStartContract {
  return {
    canStartSandbox: true,
    primaryPreviewTarget: "sandbox",
    shimBlocked: false,
    requiresEnvConfig: false,
    hasCriticalInstallRisk: false,
    hasCriticalCodeFailure: false,
    compatibilityShimAllowed: true,
    issueCounts: {
      code_structure_failure: 0,
      dependency_install_failure: 0,
      env_config_missing: 0,
      shim_preview_failure: 0,
      non_blocking_quality_warning: 0,
    },
    blockingCategories: [],
    ...overrides,
  };
}

describe("shouldRunOwnEngineSandbox", () => {
  it("is false when sandbox contract blocks startup", () => {
    expect(
      shouldRunOwnEngineSandbox({
        isSandboxConfigured: true,
        sandbox: sandboxContract({ canStartSandbox: false, hasCriticalCodeFailure: true }),
        parsedFileCount: 3,
      }),
    ).toBe(false);
  });

  it("is false when no files", () => {
    expect(
      shouldRunOwnEngineSandbox({
        isSandboxConfigured: true,
        sandbox: sandboxContract(),
        parsedFileCount: 0,
      }),
    ).toBe(false);
  });

  it("is false when sandbox not configured", () => {
    expect(
      shouldRunOwnEngineSandbox({
        isSandboxConfigured: false,
        sandbox: sandboxContract(),
        parsedFileCount: 2,
      }),
    ).toBe(false);
  });

  it("is true when configured, not blocked, and has files", () => {
    expect(
      shouldRunOwnEngineSandbox({
        isSandboxConfigured: true,
        sandbox: sandboxContract(),
        parsedFileCount: 1,
      }),
    ).toBe(true);
  });
});
