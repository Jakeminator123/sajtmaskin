import { describe, expect, it } from "vitest";
import { resolveModelSelection } from "./modelSelection";

describe("resolveModelSelection", () => {
  it("returns the canonical ID when requestedModelId is canonical", () => {
    const result = resolveModelSelection({ requestedModelId: "v0-1.5-lg" });
    expect(result).toEqual({ modelId: "v0-1.5-lg", modelTier: "v0-1.5-lg" });
  });

  it("resolves a legacy model ID to its canonical equivalent", () => {
    const result = resolveModelSelection({ requestedModelId: "v0-mini" });
    expect(result).toEqual({ modelId: "v0-1.5-md", modelTier: "v0-1.5-md" });
  });

  it("falls back to requestedModelTier when requestedModelId is invalid", () => {
    const result = resolveModelSelection({
      requestedModelId: "nonexistent-model",
      requestedModelTier: "v0-gpt-5",
    });
    expect(result).toEqual({ modelId: "v0-gpt-5", modelTier: "v0-gpt-5" });
  });

  it("uses fallbackTier when both requested values are invalid", () => {
    const result = resolveModelSelection({
      requestedModelId: "bad",
      requestedModelTier: "also-bad",
      fallbackTier: "v0-1.5-md",
    });
    expect(result).toEqual({ modelId: "v0-1.5-md", modelTier: "v0-1.5-md" });
  });

  it("returns DEFAULT_MODEL_ID when all inputs are null/undefined", () => {
    const result = resolveModelSelection({});
    expect(result).toEqual({
      modelId: "v0-max-fast",
      modelTier: "v0-max-fast",
    });
  });

  it("resolves legacy alias in requestedModelTier", () => {
    const result = resolveModelSelection({ requestedModelTier: "v0-max" });
    expect(result).toEqual({
      modelId: "v0-max-fast",
      modelTier: "v0-max-fast",
    });
  });

  it("ignores null requestedModelId and uses requestedModelTier", () => {
    const result = resolveModelSelection({
      requestedModelId: null,
      requestedModelTier: "v0-1.5-md",
    });
    expect(result).toEqual({ modelId: "v0-1.5-md", modelTier: "v0-1.5-md" });
  });
});
