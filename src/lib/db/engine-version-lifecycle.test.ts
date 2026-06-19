import { describe, expect, it } from "vitest";

import {
  isServerVerifyExpectedForLifecycle,
  resolveEngineVersionLifecycleStatus,
  resolveEngineVersionVerificationSurfaceStatus,
  canExposeEnginePreview,
  selectPreferredEngineVersion,
  resolveQualityTier,
} from "./engine-version-lifecycle";

describe("isServerVerifyExpectedForLifecycle", () => {
  it("returns true for integrations (F3) rows", () => {
    expect(isServerVerifyExpectedForLifecycle({ lifecycleStage: "integrations" })).toBe(true);
  });

  it("returns false for design (F2) rows — server-verify is skipped by policy", () => {
    expect(isServerVerifyExpectedForLifecycle({ lifecycleStage: "design" })).toBe(false);
  });

  it("returns false (defaults to design) for legacy rows without lifecycleStage", () => {
    expect(isServerVerifyExpectedForLifecycle({})).toBe(false);
    expect(isServerVerifyExpectedForLifecycle(null)).toBe(false);
    expect(isServerVerifyExpectedForLifecycle(undefined)).toBe(false);
  });

  it("reads snake_case lifecycle_stage too", () => {
    expect(isServerVerifyExpectedForLifecycle({ lifecycle_stage: "integrations" })).toBe(true);
    expect(isServerVerifyExpectedForLifecycle({ lifecycle_stage: "design" })).toBe(false);
  });
});

describe("resolveEngineVersionLifecycleStatus", () => {
  it("returns draft for new version", () => {
    expect(resolveEngineVersionLifecycleStatus({ verificationState: "pending" })).toBe("verifying");
    expect(resolveEngineVersionLifecycleStatus({})).toBe("draft");
  });

  it("returns verifying for pending or verifying state", () => {
    expect(resolveEngineVersionLifecycleStatus({ verificationState: "verifying" })).toBe("verifying");
    expect(resolveEngineVersionLifecycleStatus({ verificationState: "pending" })).toBe("verifying");
  });

  it("returns repairing for repairing state", () => {
    expect(resolveEngineVersionLifecycleStatus({ verificationState: "repairing" })).toBe("repairing");
  });

  it("returns repair_available for repair-available state", () => {
    expect(resolveEngineVersionLifecycleStatus({ verificationState: "repair_available" })).toBe(
      "repair_available",
    );
  });

  it("returns failed for failed state", () => {
    expect(resolveEngineVersionLifecycleStatus({ verificationState: "failed" })).toBe("failed");
  });

  it("returns promoted for promoted release state", () => {
    expect(
      resolveEngineVersionLifecycleStatus({ releaseState: "promoted", verificationState: "passed" }),
    ).toBe("promoted");
  });

  it("promoted takes precedence over repairing", () => {
    expect(
      resolveEngineVersionLifecycleStatus({ releaseState: "promoted", verificationState: "repairing" }),
    ).toBe("promoted");
  });
});

describe("resolveEngineVersionVerificationSurfaceStatus", () => {
  it("distinguishes F2 design-ready from server-verified", () => {
    expect(
      resolveEngineVersionVerificationSurfaceStatus({
        lifecycleStage: "design",
        verificationState: "pending",
      }),
    ).toBe("design_ready");
  });

  it("keeps F3 pending as verifying", () => {
    expect(
      resolveEngineVersionVerificationSurfaceStatus({
        lifecycleStage: "integrations",
        verificationState: "pending",
      }),
    ).toBe("verifying");
  });

  it("reports verified only for passed or promoted rows", () => {
    expect(resolveEngineVersionVerificationSurfaceStatus({ verificationState: "passed" })).toBe(
      "verified",
    );
    expect(resolveEngineVersionVerificationSurfaceStatus({ releaseState: "promoted" })).toBe(
      "verified",
    );
  });
});

describe("resolveQualityTier", () => {
  it("uses hasTier2LivePreviewUrl when provided instead of implied demoUrl preview", () => {
    const v = { verificationState: "verifying" as const };
    expect(resolveQualityTier(v, { hasTier2LivePreviewUrl: true })).toBe("preview");
    expect(resolveQualityTier(v, { hasTier2LivePreviewUrl: false })).toBe("none");
  });
});

describe("canExposeEnginePreview", () => {
  it("allows preview during repairing", () => {
    expect(canExposeEnginePreview({ verificationState: "repairing" })).toBe(true);
  });

  it("allows preview when repair is available", () => {
    expect(canExposeEnginePreview({ verificationState: "repair_available" })).toBe(true);
  });

  it("blocks preview when failed", () => {
    expect(canExposeEnginePreview({ verificationState: "failed" })).toBe(false);
  });

  it("allows preview during verifying", () => {
    expect(canExposeEnginePreview({ verificationState: "verifying" })).toBe(true);
  });
});

describe("selectPreferredEngineVersion", () => {
  it("prefers newest non-failed over older promoted", () => {
    const versions = [
      { versionNumber: 1, releaseState: "promoted", verificationState: "passed" },
      { versionNumber: 2, verificationState: "repairing" },
    ];
    const preferred = selectPreferredEngineVersion(versions);
    expect(preferred?.versionNumber).toBe(2);
  });

  it("skips failed, picks repairing over nothing", () => {
    const versions = [
      { versionNumber: 1, verificationState: "failed" },
      { versionNumber: 2, verificationState: "repairing" },
    ];
    const preferred = selectPreferredEngineVersion(versions);
    expect(preferred?.versionNumber).toBe(2);
  });
});
