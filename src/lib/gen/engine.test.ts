import { afterEach, describe, expect, it, vi } from "vitest";

const streamTextMock = vi.fn();
const getOpenAIModelMock = vi.fn();
const createCodeGenSSEStreamMock = vi.fn();

async function loadEngineModule() {
  vi.resetModules();
  streamTextMock.mockReset();
  getOpenAIModelMock.mockReset();
  createCodeGenSSEStreamMock.mockReset();

  getOpenAIModelMock.mockReturnValue({ provider: "mock-model" });
  streamTextMock.mockReturnValue({
    fullStream: (async function* () {})(),
    usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
  });
  createCodeGenSSEStreamMock.mockReturnValue({} as ReadableStream<Uint8Array>);

  vi.doMock("ai", () => ({
    streamText: streamTextMock,
  }));
  vi.doMock("./models", () => ({
    DEFAULT_MODEL: "gpt-5.4",
    getOpenAIModel: getOpenAIModelMock,
    isAnthropicModel: (id: string) => id.startsWith("claude-"),
  }));
  vi.doMock("./request-metadata", () => ({
    buildUserPromptContent: (prompt: string) => prompt,
  }));
  vi.doMock("./stream/stream-format", () => ({
    createCodeGenSSEStream: createCodeGenSSEStreamMock,
  }));
  vi.doMock("./default-thinking", () => ({
    getDefaultThinkingEnabled: () => false,
  }));
  vi.doMock("./system-prompt-assert", () => ({
    assertSystemPromptShape: () => [],
    logAndMaybeThrowOnSystemPromptAssert: () => undefined,
  }));

  return import("./engine");
}

afterEach(() => {
  vi.resetModules();
});

describe("generateCode providerOptions", () => {
  it("passes adaptive Anthropic thinking options when thinking is enabled", async () => {
    const { generateCode } = await loadEngineModule();

    generateCode({
      prompt: "Build this",
      systemPrompt: "System",
      model: "claude-opus-4.8",
      thinking: true,
      reasoningEffort: "high",
    });

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock.mock.calls[0][0].providerOptions).toEqual({
      anthropic: {
        thinking: { type: "adaptive" },
        effort: "high",
      },
    });
  });

  it("passes OpenAI reasoning effort when thinking is enabled", async () => {
    const { generateCode } = await loadEngineModule();

    generateCode({
      prompt: "Build this",
      systemPrompt: "System",
      model: "gpt-5.4",
      thinking: true,
      reasoningEffort: "medium",
    });

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock.mock.calls[0][0].providerOptions).toEqual({
      openai: {
        reasoningEffort: "medium",
      },
    });
  });

  it("disables Anthropic thinking but keeps explicit effort when thinking is off", async () => {
    const { generateCode } = await loadEngineModule();

    generateCode({
      prompt: "Build this",
      systemPrompt: "System",
      model: "claude-opus-4.8",
      thinking: false,
      reasoningEffort: "medium",
    });

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock.mock.calls[0][0].providerOptions).toEqual({
      anthropic: {
        thinking: { type: "disabled" },
        effort: "medium",
      },
    });
  });

  it("omits providerOptions for OpenAI models when thinking is disabled", async () => {
    const { generateCode } = await loadEngineModule();

    generateCode({
      prompt: "Build this",
      systemPrompt: "System",
      model: "gpt-5.4",
      thinking: false,
    });

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock.mock.calls[0][0].providerOptions).toBeUndefined();
  });
});
