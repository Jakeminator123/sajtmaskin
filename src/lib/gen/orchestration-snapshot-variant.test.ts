import { describe, expect, it } from "vitest";
import {
  buildPersistedOrchestrationSnapshot,
  mergePersistedOrchestrationSnapshots,
  sanitizeOrchestrationSnapshotForStorage,
} from "./orchestration-snapshot";

const VARIANT_SELECTION = {
  source: "hint-fallback",
  score: null,
  runnerUpScore: null,
  margin: null,
  hintId: "editorial-lux",
  finalId: "editorial-lux",
  changedFromHint: false,
};

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
        variantSelection: VARIANT_SELECTION,
      },
      versionId: "ver_1",
      chatId: "chat_1",
      buildIntent: "website",
    });
    expect(out.variantId).toBe("editorial-lux");
    expect(out.scaffoldId).toBe("landing-page");
    expect(out.variantSelection).toEqual(VARIANT_SELECTION);
  });

  it("keeps scalar identity fields strict while allowing the receipt object", () => {
    const out = sanitizeOrchestrationSnapshotForStorage({
      variantId: { malformed: true },
      scaffoldId: ["landing-page"],
      lineageHash: { malformed: true },
      variantSelection: VARIANT_SELECTION,
    });

    expect(out.variantId).toBeUndefined();
    expect(out.scaffoldId).toBeUndefined();
    expect(out.lineageHash).toBeUndefined();
    expect(out.variantSelection).toEqual(VARIANT_SELECTION);
  });

  it("preserves variantTemplateId under heavy buildSpec budget", () => {
    const heavyBuildSpec: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      heavyBuildSpec[`field_${i}`] = `value_${i}`;
    }
    const out = buildPersistedOrchestrationSnapshot({
      streamMeta: {
        modelId: "gpt-5.3-codex",
        scaffoldId: "blog",
        buildSpec: heavyBuildSpec,
        variantId: "editorial-lux",
        variantTemplateId: "1fwaS3xF7MM",
      },
      versionId: "ver_1",
      chatId: "chat_1",
      buildIntent: "website",
    });
    expect(out.variantTemplateId).toBe("1fwaS3xF7MM");
    expect(out.variantId).toBe("editorial-lux");
  });
});

describe("mergePersistedOrchestrationSnapshots — variantId protection", () => {
  it("reads a legacy snapshot without a receipt and accepts one on a later round", () => {
    const legacy = {
      variantId: "editorial-lux",
      capturedAt: "2026-01-01T00:00:00Z",
    };
    const merged = mergePersistedOrchestrationSnapshots(legacy, {
      variantSelection: VARIANT_SELECTION,
      capturedAt: "2026-01-02T00:00:00Z",
    });

    expect(legacy).not.toHaveProperty("variantSelection");
    expect(merged.variantId).toBe("editorial-lux");
    expect(merged.variantSelection).toEqual(VARIANT_SELECTION);
  });

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

  it("base.variantTemplateId='X', next.variantTemplateId=null => keeps X", () => {
    const base = { variantTemplateId: "1fwaS3xF7MM", capturedAt: "2026-01-01T00:00:00Z" };
    const next = { variantTemplateId: null, capturedAt: "2026-01-02T00:00:00Z" };
    const merged = mergePersistedOrchestrationSnapshots(base, next);
    expect(merged.variantTemplateId).toBe("1fwaS3xF7MM");
  });

  it("base.variantTemplateId='X', next.variantTemplateId='Y' => takes Y", () => {
    const base = { variantTemplateId: "1fwaS3xF7MM", capturedAt: "2026-01-01T00:00:00Z" };
    const next = { variantTemplateId: "otherTemplate", capturedAt: "2026-01-02T00:00:00Z" };
    const merged = mergePersistedOrchestrationSnapshots(base, next);
    expect(merged.variantTemplateId).toBe("otherTemplate");
  });
});
