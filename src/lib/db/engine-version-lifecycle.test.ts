import { describe, expect, it } from "vitest";

import {
  isServerVerifyExpectedForLifecycle,
  resolveDeployReleaseGate,
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

  it("returns superseded for superseded state (terminal-neutral, never failed)", () => {
    expect(resolveEngineVersionLifecycleStatus({ verificationState: "superseded" })).toBe(
      "superseded",
    );
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

  it("surfaces superseded as its own neutral badge status (never failed)", () => {
    expect(
      resolveEngineVersionVerificationSurfaceStatus({ verificationState: "superseded" }),
    ).toBe("superseded");
  });
});

// Publicera-lås (Ö1): hård gate för F3/integrations (endast bevisat grön —
// passed eller promoted), mjuk för F2/design (bara failed blockerar).
describe("resolveDeployReleaseGate", () => {
  const notGreenStates = ["pending", "verifying", "repairing", "repair_available"] as const;

  it("blocks every not-yet-green F3 (integrations) state with DEPLOY_RELEASE_GATE_NOT_GREEN", () => {
    for (const state of notGreenStates) {
      const gate = resolveDeployReleaseGate({
        lifecycle_stage: "integrations",
        verification_state: state,
      });
      expect(gate.allowed).toBe(false);
      expect(gate.code).toBe("DEPLOY_RELEASE_GATE_NOT_GREEN");
      expect(gate.message).toMatch(/ReleaseGate/);
    }
  });

  it("allows F3 when verification_state is passed", () => {
    expect(
      resolveDeployReleaseGate({ lifecycle_stage: "integrations", verification_state: "passed" }),
    ).toEqual({ allowed: true });
  });

  it("allows F3 when release_state is promoted (even if verification_state is not passed)", () => {
    expect(
      resolveDeployReleaseGate({
        lifecycle_stage: "integrations",
        release_state: "promoted",
        verification_state: "pending",
      }),
    ).toEqual({ allowed: true });
  });

  it("blocks failed F3 with DEPLOY_VERSION_FAILED — even when promoted", () => {
    const gate = resolveDeployReleaseGate({
      lifecycle_stage: "integrations",
      verification_state: "failed",
    });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("DEPLOY_VERSION_FAILED");

    const promotedButFailed = resolveDeployReleaseGate({
      lifecycle_stage: "integrations",
      release_state: "promoted",
      verification_state: "failed",
    });
    expect(promotedButFailed.allowed).toBe(false);
    expect(promotedButFailed.code).toBe("DEPLOY_VERSION_FAILED");
  });

  it("allows every non-failed F2 (design) state — soft gate, server-verify never runs", () => {
    for (const state of [...notGreenStates, "passed"] as const) {
      expect(
        resolveDeployReleaseGate({ lifecycle_stage: "design", verification_state: state }),
      ).toEqual({ allowed: true });
    }
  });

  it("blocks failed F2 with DEPLOY_VERSION_FAILED", () => {
    const gate = resolveDeployReleaseGate({
      lifecycle_stage: "design",
      verification_state: "failed",
    });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("DEPLOY_VERSION_FAILED");
  });

  // 2026-07: superseded är terminal-neutralt — som pending, inte som failed.
  it("treats superseded like pending: F2 deployable, F3 not green", () => {
    expect(
      resolveDeployReleaseGate({ lifecycle_stage: "design", verification_state: "superseded" }),
    ).toEqual({ allowed: true });
    const f3 = resolveDeployReleaseGate({
      lifecycle_stage: "integrations",
      verification_state: "superseded",
    });
    expect(f3.allowed).toBe(false);
    expect(f3.code).toBe("DEPLOY_RELEASE_GATE_NOT_GREEN");
  });

  it("treats legacy rows without lifecycle_stage as design (soft)", () => {
    expect(resolveDeployReleaseGate({ verification_state: "pending" })).toEqual({ allowed: true });
    expect(resolveDeployReleaseGate({})).toEqual({ allowed: true });
    expect(resolveDeployReleaseGate(null)).toEqual({ allowed: true });
    expect(resolveDeployReleaseGate(undefined)).toEqual({ allowed: true });
  });

  it("reads camelCase fields too", () => {
    expect(
      resolveDeployReleaseGate({ lifecycleStage: "integrations", verificationState: "verifying" })
        .allowed,
    ).toBe(false);
    expect(
      resolveDeployReleaseGate({ lifecycleStage: "integrations", releaseState: "promoted" })
        .allowed,
    ).toBe(true);
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

  it("never prefers a superseded row (abandoned mid-verify snapshot)", () => {
    const versions = [
      { versionNumber: 1, verificationState: "passed" },
      { versionNumber: 2, verificationState: "superseded" },
    ];
    const preferred = selectPreferredEngineVersion(versions);
    expect(preferred?.versionNumber).toBe(1);
  });
});

describe("canExposeEnginePreview — superseded", () => {
  it("allows preview of a superseded version (neutral, like an old pending version)", () => {
    expect(canExposeEnginePreview({ verificationState: "superseded" })).toBe(true);
  });
});
