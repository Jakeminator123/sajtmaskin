import { describe, expect, it } from "vitest";
import { describeEnvKeyValueState } from "./dossier-overview";

describe("describeEnvKeyValueState", () => {
  it("treats a stored real value as filled regardless of enforcement", () => {
    const state = describeEnvKeyValueState({
      enforcement: "build",
      hasRealValue: true,
      placeholderCovered: false,
    });
    expect(state.label).toBe("Ifylld");
    expect(state.tone).toBe("success");
  });

  it("flags a build-enforced key without a value as a hard requirement", () => {
    const state = describeEnvKeyValueState({
      enforcement: "build",
      hasRealValue: false,
      placeholderCovered: false,
    });
    expect(state.label).toBe("Kräver riktigt värde");
    expect(state.tone).toBe("warning");
  });

  it("prioritizes the build requirement over placeholder coverage (no false green)", () => {
    // A build key that happens to be placeholder-covered must still read as a
    // requirement — otherwise the panel would look satisfied while the F3 gate
    // treats the same key as missing.
    const state = describeEnvKeyValueState({
      enforcement: "build",
      hasRealValue: false,
      placeholderCovered: true,
    });
    expect(state.label).toBe("Kräver riktigt värde");
    expect(state.tone).toBe("warning");
  });

  it("marks a non-build placeholder-covered key as auto-handled in F2", () => {
    const state = describeEnvKeyValueState({
      enforcement: "feature-runtime",
      hasRealValue: false,
      placeholderCovered: true,
    });
    expect(state.label).toBe("Auto-placeholder i F2");
    expect(state.tone).toBe("muted");
  });

  it("marks an uncovered optional key as optional", () => {
    const state = describeEnvKeyValueState({
      enforcement: "warn-only",
      hasRealValue: false,
      placeholderCovered: false,
    });
    expect(state.label).toBe("Valfri");
    expect(state.tone).toBe("muted");
  });
});
