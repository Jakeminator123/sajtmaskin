import { describe, expect, it } from "vitest";
import {
  mergePersistedOrchestrationSnapshots,
  prependOrchestrationContinuityToFollowUp,
  sanitizeOrchestrationSnapshotForStorage,
} from "./orchestration-snapshot";

describe("sanitizeOrchestrationSnapshotForStorage", () => {
  it("drops sensitive key names", () => {
    const out = sanitizeOrchestrationSnapshotForStorage({
      modelTier: "max",
      api_secret: "x",
      nested: { refreshToken: "bad" },
    });
    expect(out.modelTier).toBe("max");
    expect(out.api_secret).toBeUndefined();
    expect((out.nested as Record<string, unknown>)?.refreshToken).toBeUndefined();
  });

  it("truncates oversized string values", () => {
    const long = "a".repeat(13_000);
    const out = sanitizeOrchestrationSnapshotForStorage({ note: long });
    const note = out.note as string;
    expect(note.endsWith("…")).toBe(true);
    expect(note.length).toBe(12_001);
  });
});

describe("mergePersistedOrchestrationSnapshots", () => {
  it("overlays next onto previous", () => {
    const out = mergePersistedOrchestrationSnapshots(
      { a: 1, b: 2 },
      { b: 3, c: 4 },
    );
    expect(out).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("treats null previous as empty base", () => {
    const out = mergePersistedOrchestrationSnapshots(null, { x: "y" });
    expect(out).toEqual({ x: "y" });
  });
});

describe("prependOrchestrationContinuityToFollowUp", () => {
  it("prepends when snapshot has signals", () => {
    const next = prependOrchestrationContinuityToFollowUp("Change the hero", {
      modelTier: "max",
      promptStrategy: "compress",
      scaffoldId: "sc_1",
      buildIntent: "landing_page",
      lastVersionId: "ver_9",
    });
    expect(next).toContain("Continuity");
    expect(next).toContain("max");
    expect(next).toContain("landing_page");
    expect(next).toContain("Change the hero");
  });

  it("returns message unchanged when snapshot empty", () => {
    expect(prependOrchestrationContinuityToFollowUp("Hi", {})).toBe("Hi");
  });
});
