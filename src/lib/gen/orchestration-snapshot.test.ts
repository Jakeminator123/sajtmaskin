import { describe, expect, it } from "vitest";
import {
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

describe("prependOrchestrationContinuityToFollowUp", () => {
  it("prepends when snapshot has signals", () => {
    const next = prependOrchestrationContinuityToFollowUp("Change the hero", {
      modelTier: "max",
      promptStrategy: "compress",
      scaffoldId: "sc_1",
      lastVersionId: "ver_9",
    });
    expect(next).toContain("Continuity");
    expect(next).toContain("max");
    expect(next).toContain("Change the hero");
  });

  it("returns message unchanged when snapshot empty", () => {
    expect(prependOrchestrationContinuityToFollowUp("Hi", {})).toBe("Hi");
  });
});
