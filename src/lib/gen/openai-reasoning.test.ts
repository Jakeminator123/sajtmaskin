import { describe, expect, it } from "vitest";
import {
  buildOpenAIReasoningProviderOptions,
  openaiModelIdFromAssistString,
  supportsOpenAIReasoningEffort,
} from "./openai-reasoning";

describe("openaiModelIdFromAssistString", () => {
  it("strips provider prefix", () => {
    expect(openaiModelIdFromAssistString("openai/gpt-5.3-codex")).toBe("gpt-5.3-codex");
    expect(openaiModelIdFromAssistString("gpt-5.4")).toBe("gpt-5.4");
  });
});

describe("supportsOpenAIReasoningEffort", () => {
  it("is true for GPT-5 and Codex ids", () => {
    expect(supportsOpenAIReasoningEffort("gpt-5.3-codex")).toBe(true);
    expect(supportsOpenAIReasoningEffort("gpt-5.4")).toBe(true);
    expect(supportsOpenAIReasoningEffort("o3-mini")).toBe(true);
  });

  it("is false for gpt-4.1 and Claude", () => {
    expect(supportsOpenAIReasoningEffort("gpt-4.1")).toBe(false);
    expect(supportsOpenAIReasoningEffort("claude-opus-4.6")).toBe(false);
  });
});

describe("buildOpenAIReasoningProviderOptions", () => {
  it("passes reasoningEffort for GPT-5 Codex when thinking is on", () => {
    expect(buildOpenAIReasoningProviderOptions("gpt-5.3-codex", "pro", true)).toEqual({
      providerOptions: { openai: { reasoningEffort: "medium" } },
    });
  });

  it("omits options when thinking is off or model unsupported", () => {
    expect(buildOpenAIReasoningProviderOptions("gpt-5.3-codex", "pro", false)).toEqual({});
    expect(buildOpenAIReasoningProviderOptions("gpt-4.1", "fast", true)).toEqual({});
  });
});
