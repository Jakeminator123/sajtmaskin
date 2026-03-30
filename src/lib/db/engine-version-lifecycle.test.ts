import { describe, expect, it } from "vitest";

import {
  resolveEngineVersionLifecycleStatus,
  resolveEngineVersionDisplayStatus,
  canExposeEnginePreview,
  selectPreferredEngineVersion,
  resolveQualityTier,
} from "./engine-version-lifecycle";

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

describe("resolveEngineVersionDisplayStatus", () => {
  it("shows repairing during repair", () => {
    expect(
      resolveEngineVersionDisplayStatus({ verificationState: "repairing" }),
    ).toBe("repairing");
  });

  it("shows retrying when failed but newer version exists", () => {
    const failed = { verificationState: "failed", versionNumber: 1 };
    const newer = { verificationState: "verifying", versionNumber: 2 };
    expect(resolveEngineVersionDisplayStatus(failed, [failed, newer])).toBe("retrying");
  });
});

describe("resolveQualityTier", () => {
  it("uses hasSandboxUrl when provided instead of implied demoUrl preview", () => {
    const v = { verificationState: "verifying" as const };
    expect(resolveQualityTier(v, { hasSandboxUrl: true })).toBe("preview");
    expect(resolveQualityTier(v, { hasSandboxUrl: false })).toBe("none");
  });
});

describe("canExposeEnginePreview", () => {
  it("allows preview during repairing", () => {
    expect(canExposeEnginePreview({ verificationState: "repairing" })).toBe(true);
  });

  it("blocks preview when failed", () => {
    expect(canExposeEnginePreview({ verificationState: "failed" })).toBe(false);
  });

  it("allows preview during verifying", () => {
    expect(canExposeEnginePreview({ verificationState: "verifying" })).toBe(true);
  });
});

describe("selectPreferredEngineVersion", () => {
  it("prefers promoted over repairing", () => {
    const versions = [
      { versionNumber: 1, releaseState: "promoted", verificationState: "passed" },
      { versionNumber: 2, verificationState: "repairing" },
    ];
    const preferred = selectPreferredEngineVersion(versions);
    expect(preferred?.versionNumber).toBe(1);
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
