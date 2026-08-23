import { afterEach, describe, expect, it, vi } from "vitest";

const generateObjectMock = vi.hoisted(() => vi.fn());
const createDirectModelMock = vi.hoisted(() => vi.fn());
const recordLlmUsageMock = vi.hoisted(() => vi.fn());

async function loadModule() {
  vi.resetModules();
  generateObjectMock.mockReset();
  createDirectModelMock.mockReset();
  recordLlmUsageMock.mockReset();
  createDirectModelMock.mockReturnValue({ provider: "mock-model" });
  vi.doMock("ai", () => ({ generateObject: generateObjectMock }));
  vi.doMock("./direct-model", () => ({
    createDirectModel: createDirectModelMock,
    getTemperatureConfig: () => ({}),
  }));
  vi.doMock("@/lib/observability/llm-usage", () => ({
    recordLlmUsage: recordLlmUsageMock,
  }));
  vi.doMock("@/lib/utils/debug", () => ({
    debugLog: () => undefined,
    errorLog: () => undefined,
  }));
  vi.doMock("@/lib/logging/dev-log", () => ({
    devLogAppend: () => undefined,
  }));
  return import("./site-brief-generation");
}

afterEach(() => {
  vi.resetModules();
});

const MINIMAL_BRIEF = {
  projectTitle: "Kafé",
  brandName: "Kafé",
  oneSentencePitch: "Fika i Malmö.",
  pages: [],
};

describe("generateSiteBriefObject reasoning", () => {
  it("requests a detailed OpenAI reasoning summary and returns it", async () => {
    const { generateSiteBriefObject } = await loadModule();
    generateObjectMock.mockResolvedValue({
      object: MINIMAL_BRIEF,
      reasoning: "  Jag lägger hero och meny.  ",
      usage: {},
    });

    const result = await generateSiteBriefObject({
      prompt: "Ett kafé",
      normalizedModel: "openai/gpt-5.6-sol",
      imageGenerations: false,
      source: "dynamic_instructions",
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(generateObjectMock.mock.calls[0][0].providerOptions).toEqual({
      openai: { reasoningSummary: "detailed" },
    });
    expect(result.reasoningSummary).toBe("Jag lägger hero och meny.");
    expect(result.brief.reasoningSummary).toBe("Jag lägger hero och meny.");
    expect(result.provider).toBe("openai");
  });

  it("does not send OpenAI reasoning options to Anthropic", async () => {
    const { generateSiteBriefObject } = await loadModule();
    generateObjectMock.mockResolvedValue({
      object: MINIMAL_BRIEF,
      usage: {},
    });

    const result = await generateSiteBriefObject({
      prompt: "Ett kafé",
      normalizedModel: "anthropic/claude-opus-4.8",
      imageGenerations: false,
      source: "dynamic_instructions",
    });

    expect(generateObjectMock.mock.calls[0][0].providerOptions).toBeUndefined();
    expect(result.reasoningSummary).toBeNull();
    expect(result.brief.reasoningSummary).toBeUndefined();
    expect(result.provider).toBe("anthropic");
  });

  it("treats missing generateObject.reasoning as absent", async () => {
    const { generateSiteBriefObject } = await loadModule();
    generateObjectMock.mockResolvedValue({
      object: MINIMAL_BRIEF,
      usage: {},
    });

    const result = await generateSiteBriefObject({
      prompt: "Ett kafé",
      normalizedModel: "openai/gpt-5.6-sol",
      imageGenerations: false,
    });

    expect(result.reasoningSummary).toBeNull();
    expect(result.brief.oneSentencePitch).toBe("Fika i Malmö.");
  });
});
