import { describe, expect, it } from "vitest";
import { shouldStartOwnEnginePreview } from "./own-engine-sandbox-gate";
import type { PreviewStartContract } from "@/lib/gen/stream/preflight-contract";

function sandboxContract(overrides?: Partial<PreviewStartContract>): PreviewStartContract {
  return {
    canStartPreview: true,
    primaryPreviewTarget: "preview",
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
    ...overrides,
  };
}

describe("shouldStartOwnEnginePreview", () => {
  it("is false when preview-start contract blocks startup", () => {
    expect(
      shouldStartOwnEnginePreview({
        isPreviewConfigured: true,
        previewStart: sandboxContract({ canStartPreview: false, hasCriticalCodeFailure: true }),
        parsedFileCount: 3,
      }),
    ).toBe(false);
  });

  it("is false when no files", () => {
    expect(
      shouldStartOwnEnginePreview({
        isPreviewConfigured: true,
        previewStart: sandboxContract(),
        parsedFileCount: 0,
      }),
    ).toBe(false);
  });

  it("is false when preview is not configured", () => {
    expect(
      shouldStartOwnEnginePreview({
        isPreviewConfigured: false,
        previewStart: sandboxContract(),
        parsedFileCount: 2,
      }),
    ).toBe(false);
  });

  it("is true when configured, not blocked, and has files", () => {
    expect(
      shouldStartOwnEnginePreview({
        isPreviewConfigured: true,
        previewStart: sandboxContract(),
        parsedFileCount: 1,
      }),
    ).toBe(true);
  });
});
