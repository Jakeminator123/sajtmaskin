import { describe, expect, it } from "vitest";
import {
  clampOpenAIReasoningEffort,
  getOpenAIModelCapabilities,
  isOpenAIReasoningModelId,
  minimumOpenAIReasoningEffort,
  resolveOpenAIReasoningEffort,
  supportsOpenAIReasoningMode,
} from "./openai-capabilities";

describe("OpenAI model capabilities", () => {
  it("normalizes provider prefixes and casing", () => {
    expect(getOpenAIModelCapabilities("openai/GPT-6.1-Sol")).toEqual(
      getOpenAIModelCapabilities("gpt-6.1-sol"),
    );
    expect(getOpenAIModelCapabilities("gpt-5.5")).toBeNull();
    expect(getOpenAIModelCapabilities("anthropic/claude-opus-4-8")).toBeNull();
  });

  it("knows GPT-6.1 Sol and GPT-6 Astra have no `none` effort; Luna and GPT-5.6 do", () => {
    expect(minimumOpenAIReasoningEffort("gpt-6.1-sol")).toBe("low");
    expect(minimumOpenAIReasoningEffort("gpt-6-astra")).toBe("low");
    expect(minimumOpenAIReasoningEffort("gpt-6-luna")).toBe("none");
    expect(minimumOpenAIReasoningEffort("gpt-5.6-sol")).toBe("none");
    expect(minimumOpenAIReasoningEffort("gpt-5.4")).toBeNull();
  });

  it("clamps an unsupported effort to the nearest the model accepts", () => {
    expect(clampOpenAIReasoningEffort("gpt-6.1-sol", "none")).toBe("low");
    expect(clampOpenAIReasoningEffort("gpt-6.1-sol", "xhigh")).toBe("xhigh");
    expect(clampOpenAIReasoningEffort("gpt-6-luna", "none")).toBe("none");
    expect(clampOpenAIReasoningEffort("gpt-5.4", "none")).toBe("none");
  });

  it("resolves an omitted effort to the model minimum instead of the provider's medium", () => {
    expect(resolveOpenAIReasoningEffort("gpt-6.1-sol", undefined)).toBe("low");
    expect(resolveOpenAIReasoningEffort("gpt-6-luna", undefined)).toBe("none");
    expect(resolveOpenAIReasoningEffort("gpt-6.1-sol", "high")).toBe("high");
    expect(resolveOpenAIReasoningEffort("gpt-5.4", "high")).toBeUndefined();
  });

  it("detects reasoning models by version like @ai-sdk/openai", () => {
    for (const id of ["gpt-6.1-sol", "openai/gpt-6-luna", "gpt-5-mini", "gpt-5.2", "o3-mini"]) {
      expect(isOpenAIReasoningModelId(id), id).toBe(true);
    }
    for (const id of ["gpt-4.1", "gpt-4o", "gpt-5-chat-latest", "claude-opus-4-8"]) {
      expect(isOpenAIReasoningModelId(id), id).toBe(false);
    }
  });

  it("allows reasoning mode on the GPT-5.6 and GPT-6 families only", () => {
    expect(supportsOpenAIReasoningMode("gpt-6.1-sol")).toBe(true);
    expect(supportsOpenAIReasoningMode("gpt-5.6-terra")).toBe(true);
    expect(supportsOpenAIReasoningMode("gpt-5.5")).toBe(false);
  });
});
