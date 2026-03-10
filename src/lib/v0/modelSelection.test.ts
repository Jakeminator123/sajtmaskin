import { describe, expect, it } from "vitest";
import { resolveModelSelection, resolveEngineModelId } from "./modelSelection";

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

  it("accepts v0-1.5-sm as alias for Max Fast", () => {
    const result = resolveModelSelection({ requestedModelId: "v0-1.5-sm" });
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

describe("resolveEngineModelId", () => {
  it("returns v0 tier when useV0Fallback is true", () => {
    expect(resolveEngineModelId("v0-max-fast", true)).toBe("v0-max-fast");
    expect(resolveEngineModelId("v0-gpt-5", true)).toBe("v0-gpt-5");
  });

  it("maps v0 tier to OpenAI model when useV0Fallback is false", () => {
    expect(resolveEngineModelId("v0-max-fast", false)).toBe("gpt-5.4");
    expect(resolveEngineModelId("v0-1.5-md", false)).toBe("gpt-5.2");
    expect(resolveEngineModelId("v0-gpt-5", false)).toBe("gpt-5.4");
    expect(resolveEngineModelId("v0-1.5-lg", false)).toBe("gpt-5.4");
  });
});
