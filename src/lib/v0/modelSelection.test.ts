import { describe, expect, it } from "vitest";
import { resolveModelSelection, resolveEngineModelId } from "./modelSelection";

describe("resolveModelSelection", () => {
  it("returns the canonical ID when requestedModelId is canonical", () => {
    const result = resolveModelSelection({ requestedModelId: "v0-1.5-lg" });
    expect(result).toEqual({ modelId: "max", modelTier: "max" });
  });

  it("resolves a legacy model ID to its canonical equivalent", () => {
    const result = resolveModelSelection({ requestedModelId: "v0-mini" });
    expect(result).toEqual({ modelId: "pro", modelTier: "pro" });
  });

  it("falls back to requestedModelTier when requestedModelId is invalid", () => {
    const result = resolveModelSelection({
      requestedModelId: "nonexistent-model",
      requestedModelTier: "v0-gpt-5",
    });
    expect(result).toEqual({ modelId: "codex", modelTier: "codex" });
  });

  it("uses fallbackTier when both requested values are invalid", () => {
    const result = resolveModelSelection({
      requestedModelId: "bad",
      requestedModelTier: "also-bad",
      fallbackTier: "pro",
    });
    expect(result).toEqual({ modelId: "pro", modelTier: "pro" });
  });

  it("returns DEFAULT_MODEL_ID when all inputs are null/undefined", () => {
    const result = resolveModelSelection({});
    expect(result).toEqual({
      modelId: "max",
      modelTier: "max",
    });
  });

  it("resolves legacy alias in requestedModelTier", () => {
    const result = resolveModelSelection({ requestedModelTier: "v0-max" });
    expect(result).toEqual({
      modelId: "fast",
      modelTier: "fast",
    });
  });

  it("accepts v0-1.5-sm as alias for Max Fast", () => {
    const result = resolveModelSelection({ requestedModelId: "v0-1.5-sm" });
    expect(result).toEqual({
      modelId: "fast",
      modelTier: "fast",
    });
  });

  it("ignores null requestedModelId and uses requestedModelTier", () => {
    const result = resolveModelSelection({
      requestedModelId: null,
      requestedModelTier: "v0-1.5-md",
    });
    expect(result).toEqual({ modelId: "pro", modelTier: "pro" });
  });
});

describe("resolveEngineModelId", () => {
  it("returns v0 tier when useV0Fallback is true", () => {
    expect(resolveEngineModelId("fast", true)).toBe("v0-max-fast");
    expect(resolveEngineModelId("codex", true)).toBe("v0-gpt-5");
  });

  it("maps the internal profile to OpenAI model when useV0Fallback is false", () => {
    expect(resolveEngineModelId("fast", false)).toBe("gpt-4.1");
    expect(resolveEngineModelId("pro", false)).toBe("gpt-5.3-codex");
    expect(resolveEngineModelId("codex", false)).toBe("gpt-5.1-codex-max");
    expect(resolveEngineModelId("max", false)).toBe("gpt-5.4");
  });
});
