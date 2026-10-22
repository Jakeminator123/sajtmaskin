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

  vi.doMock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>();
    return {
      ...actual,
      streamText: streamTextMock,
      stepCountIs: actual.stepCountIs,
    };
  });
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
        reasoningSummary: "detailed",
      },
    });
  });

  it("passes GPT-5.6 high effort and pro reasoning mode", async () => {
    const { generateCode } = await loadEngineModule();

    generateCode({
      prompt: "Build this",
      systemPrompt: "System",
      model: "gpt-5.6-sol",
      thinking: true,
      reasoningEffort: "high",
      reasoningMode: "pro",
    });

    expect(streamTextMock.mock.calls[0][0].providerOptions).toEqual({
      openai: {
        reasoningEffort: "high",
        reasoningSummary: "detailed",
        reasoningMode: "pro",
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

  it("runs registered OpenAI models at their lowest effort when thinking is disabled", async () => {
    const { generateCode } = await loadEngineModule();

    generateCode({
      prompt: "Build this",
      systemPrompt: "System",
      model: "gpt-6.1-sol",
      thinking: false,
    });
    generateCode({
      prompt: "Build this",
      systemPrompt: "System",
      model: "gpt-6-luna",
      thinking: false,
    });

    expect(streamTextMock.mock.calls[0][0].providerOptions).toEqual({
      openai: { reasoningEffort: "low" },
    });
    expect(streamTextMock.mock.calls[1][0].providerOptions).toEqual({
      openai: { reasoningEffort: "none" },
    });
  });

  it("aliases a retired model before clamping none and logging usage", async () => {
    const { generateCode } = await loadEngineModule();

    generateCode({
      prompt: "Build this",
      systemPrompt: "System",
      model: "gpt-5.3-codex",
      thinking: true,
      reasoningEffort: "none",
    });

    expect(getOpenAIModelMock).toHaveBeenCalledWith("gpt-6.1-sol");
    expect(streamTextMock.mock.calls[0][0].providerOptions).toEqual({
      openai: { reasoningEffort: "low", reasoningSummary: "detailed" },
    });
    expect(createCodeGenSSEStreamMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ usageModelId: "gpt-6.1-sol" }),
    );
  });

  it("clamps an effort GPT-6.1 Sol does not accept when thinking is enabled", async () => {
    const { generateCode } = await loadEngineModule();

    generateCode({
      prompt: "Build this",
      systemPrompt: "System",
      model: "gpt-6.1-sol",
      thinking: true,
      reasoningEffort: "none",
    });

    expect(streamTextMock.mock.calls[0][0].providerOptions).toEqual({
      openai: { reasoningEffort: "low", reasoningSummary: "detailed" },
    });
  });

  it("omits providerOptions for unregistered OpenAI models when thinking is disabled", async () => {
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

  it("maps the public maxSteps budget to stopWhen and keeps abortSignal", async () => {
    const { generateCode } = await loadEngineModule();
    const tools = { lookup: { description: "lookup" } };
    const abortController = new AbortController();

    generateCode({
      prompt: "Build this",
      systemPrompt: "System",
      abortSignal: abortController.signal,
      tools: tools as never,
      maxSteps: 2,
    });

    const settings = streamTextMock.mock.calls[0][0];
    expect(settings.tools).toBe(tools);
    expect(settings.maxSteps).toBeUndefined();
    expect(settings.abortSignal).toBe(abortController.signal);
    expect(settings.stopWhen({ steps: [{}] })).toBe(false);
    expect(settings.stopWhen({ steps: [{}, {}] })).toBe(true);

    generateCode({
      prompt: "Build this",
      systemPrompt: "System",
      tools: tools as never,
    });
    const defaultStop = streamTextMock.mock.calls[1][0].stopWhen;
    expect(streamTextMock.mock.calls[1][0].maxSteps).toBeUndefined();
    expect(defaultStop({ steps: [{}, {}, {}] })).toBe(false);
    expect(defaultStop({ steps: [{}, {}, {}, {}] })).toBe(true);

    generateCode({
      prompt: "Build this",
      systemPrompt: "System",
    });
    expect(streamTextMock.mock.calls[2][0].stopWhen).toBeUndefined();
    expect(streamTextMock.mock.calls[2][0].maxSteps).toBeUndefined();
    expect(streamTextMock.mock.calls[2][0].abortSignal).toBeInstanceOf(AbortSignal);
  });
});
