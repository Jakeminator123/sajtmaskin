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

  it("shows retrying when repairing but newer version exists", () => {
    const repairing = { verificationState: "repairing", versionNumber: 1 };
    const newer = { verificationState: "passed", releaseState: "promoted", versionNumber: 2 };
    expect(resolveEngineVersionDisplayStatus(repairing, [repairing, newer])).toBe("retrying");
  });

  it("shows retrying when failed but newer version exists", () => {
    const failed = { verificationState: "failed", versionNumber: 1 };
    const newer = { verificationState: "verifying", versionNumber: 2 };
    expect(resolveEngineVersionDisplayStatus(failed, [failed, newer])).toBe("retrying");
  });

  it("shows retrying when verifying but newer version exists", () => {
    const verifying = { verificationState: "verifying", versionNumber: 1 };
    const newer = { verificationState: "pending", versionNumber: 2 };
    expect(resolveEngineVersionDisplayStatus(verifying, [verifying, newer])).toBe("retrying");
  });

  it("keeps pending versions as draft when a newer version exists", () => {
    const pending = { verificationState: "pending", versionNumber: 1 };
    const newer = { verificationState: "verifying", versionNumber: 2 };
    expect(resolveEngineVersionDisplayStatus(pending, [pending, newer])).toBe("draft");
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
