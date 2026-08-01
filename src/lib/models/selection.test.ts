import { describe, expect, it } from "vitest";
import { resolveModelSelection, resolveEngineModelId } from "@/lib/models/selection";

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
      modelId: "pro",
      modelTier: "pro",
    });
  });

  it("resolves legacy alias in requestedModelTier", () => {
    const result = resolveModelSelection({ requestedModelTier: "v0-max" });
    expect(result).toEqual({
      modelId: "premium",
      modelTier: "premium",
    });
  });

  it("accepts v0-1.5-sm as alias for Max Fast", () => {
    const result = resolveModelSelection({ requestedModelId: "v0-1.5-sm" });
    expect(result).toEqual({
      modelId: "premium",
      modelTier: "premium",
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
  it("maps the canonical profile to the own-engine model", () => {
    expect(resolveEngineModelId("premium")).toBe("gpt-5.6-sol");
    expect(
      resolveEngineModelId(resolveModelSelection({ requestedModelId: "fast" }).modelTier),
    ).toBe("gpt-5.6-sol");
    expect(resolveEngineModelId("pro")).toBe("gpt-5.3-codex");
    expect(resolveEngineModelId("codex")).toBe("gpt-5.3-codex");
    expect(resolveEngineModelId("max")).toBe("gpt-5.5");
    expect(resolveEngineModelId("anthropic")).toBe("claude-opus-4.8");
  });

  it("honors retired SAJTMASKIN_MODEL_FAST when Premium env is unset", () => {
    const previousPremium = process.env.SAJTMASKIN_MODEL_PREMIUM;
    const previousFast = process.env.SAJTMASKIN_MODEL_FAST;
    delete process.env.SAJTMASKIN_MODEL_PREMIUM;
    process.env.SAJTMASKIN_MODEL_FAST = "gpt-5.5";
    try {
      expect(resolveEngineModelId("premium")).toBe("gpt-5.5");
    } finally {
      if (previousPremium === undefined) {
        delete process.env.SAJTMASKIN_MODEL_PREMIUM;
      } else {
        process.env.SAJTMASKIN_MODEL_PREMIUM = previousPremium;
      }
      if (previousFast === undefined) {
        delete process.env.SAJTMASKIN_MODEL_FAST;
      } else {
        process.env.SAJTMASKIN_MODEL_FAST = previousFast;
      }
    }
  });
});
