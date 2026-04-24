import { describe, expect, it } from "vitest";
import {
  buildPersistedOrchestrationSnapshot,
  mergePersistedOrchestrationSnapshots,
  sanitizeOrchestrationSnapshotForStorage,
} from "./orchestration-snapshot";

describe("sanitizeOrchestrationSnapshotForStorage — variantId roundtrip", () => {
  it("preserves variantId when meta has minimal nested fields", () => {
    const meta = {
      modelId: "gpt-5.3-codex",
      scaffoldId: "landing-page",
      variantId: "editorial-lux",
    };
    const out = sanitizeOrchestrationSnapshotForStorage(meta);
    expect(out.variantId).toBe("editorial-lux");
  });

  it("keeps variantId when meta exceeds MAX_KEYS budget (heavy buildSpec)", () => {
    const heavyBuildSpec: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      heavyBuildSpec[`field_${i}`] = `value_${i}`;
    }
    const meta = {
      modelId: "gpt-5.3-codex",
      scaffoldId: "landing-page",
      buildSpec: heavyBuildSpec,
      variantId: "editorial-lux",
    };
    const out = sanitizeOrchestrationSnapshotForStorage(meta);
    expect(out.variantId).toBe("editorial-lux");
  });

  it("keeps protected fields via buildPersistedOrchestrationSnapshot too", () => {
    const heavyBuildSpec: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      heavyBuildSpec[`field_${i}`] = `value_${i}`;
    }
    const out = buildPersistedOrchestrationSnapshot({
      streamMeta: {
        modelId: "gpt-5.3-codex",
        scaffoldId: "landing-page",
        buildSpec: heavyBuildSpec,
        variantId: "editorial-lux",
      },
      versionId: "ver_1",
      chatId: "chat_1",
      buildIntent: "website",
    });
    expect(out.variantId).toBe("editorial-lux");
    expect(out.scaffoldId).toBe("landing-page");
  });
});

describe("mergePersistedOrchestrationSnapshots — variantId protection", () => {
  it("base.variantId='X', next.variantId=null => merged.variantId='X'", () => {
    const base = { variantId: "editorial-lux", capturedAt: "2026-01-01T00:00:00Z" };
    const next = { variantId: null, capturedAt: "2026-01-02T00:00:00Z" };
    const merged = mergePersistedOrchestrationSnapshots(base, next);
    expect(merged.variantId).toBe("editorial-lux");
  });

  it("base.variantId='X', next.variantId='Y' => merged.variantId='Y' (legitimate change)", () => {
    const base = { variantId: "editorial-lux", capturedAt: "2026-01-01T00:00:00Z" };
    const next = { variantId: "corporate-grid", capturedAt: "2026-01-02T00:00:00Z" };
    const merged = mergePersistedOrchestrationSnapshots(base, next);
    expect(merged.variantId).toBe("corporate-grid");
  });

  it("base.variantId=null, next.variantId='X' => merged.variantId='X' (set first time)", () => {
    const base = { variantId: null, capturedAt: "2026-01-01T00:00:00Z" };
    const next = { variantId: "editorial-lux", capturedAt: "2026-01-02T00:00:00Z" };
    const merged = mergePersistedOrchestrationSnapshots(base, next);
    expect(merged.variantId).toBe("editorial-lux");
  });

  it("scaffoldId protection (same principle)", () => {
    const base = { scaffoldId: "landing-page", capturedAt: "2026-01-01T00:00:00Z" };
    const next = { scaffoldId: null, capturedAt: "2026-01-02T00:00:00Z" };
    const merged = mergePersistedOrchestrationSnapshots(base, next);
    expect(merged.scaffoldId).toBe("landing-page");
  });
});
