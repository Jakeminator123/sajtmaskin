import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

function expectSystemOptionWithoutSystemMessage(call: {
  system?: unknown;
  messages?: Array<{ role?: string }>;
}) {
  expect(typeof call.system).toBe("string");
  expect(String(call.system).length).toBeGreaterThan(40);
  expect(call.messages?.some((message) => message.role === "system")).toBe(false);
  expect(call.messages?.[0]?.role).toBe("user");
}

describe("generateSiteBriefObject system option", () => {
  it("sends the system prompt via system, not as a system-role message", async () => {
    const { generateSiteBriefObject } = await loadModule();
    generateObjectMock.mockResolvedValue({
      object: MINIMAL_BRIEF,
      usage: {},
    });

    await generateSiteBriefObject({
      prompt: "Ett kafé",
      normalizedModel: "openai/gpt-5.6-sol",
      imageGenerations: false,
      source: "dynamic_instructions",
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expectSystemOptionWithoutSystemMessage(generateObjectMock.mock.calls[0][0]);
  });

  it("keeps the simplified fallback on the system option as well", async () => {
    const { generateSiteBriefObject } = await loadModule();
    generateObjectMock
      .mockRejectedValueOnce(new Error("schema parse failed"))
      .mockResolvedValueOnce({
        object: MINIMAL_BRIEF,
        usage: {},
      });

    const result = await generateSiteBriefObject({
      prompt: "Ett kafé",
      normalizedModel: "openai/gpt-5.6-sol",
      imageGenerations: false,
      source: "dynamic_instructions",
    });

    expect(result.usedSimplified).toBe(true);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
    expectSystemOptionWithoutSystemMessage(generateObjectMock.mock.calls[0][0]);
    expectSystemOptionWithoutSystemMessage(generateObjectMock.mock.calls[1][0]);
    expect(String(generateObjectMock.mock.calls[1][0].system)).toContain(
      "Keep your response concise",
    );
  });

  it("uses the system option on the Anthropic path", async () => {
    const { generateSiteBriefObject } = await loadModule();
    generateObjectMock.mockResolvedValue({
      object: MINIMAL_BRIEF,
      usage: {},
    });

    await generateSiteBriefObject({
      prompt: "Ett kafé",
      normalizedModel: "anthropic/[REDACTED]",
      imageGenerations: false,
      source: "dynamic_instructions",
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expectSystemOptionWithoutSystemMessage(generateObjectMock.mock.calls[0][0]);
  });

  it("does not leave a system-role message in the brief generateObject owner", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "site-brief-generation.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/role:\s*["']system["']/);
    expect(source).toContain("system: BRIEF_SYSTEM_PROMPT");
    expect(source).toContain("system: BRIEF_SIMPLIFIED_SYSTEM_PROMPT");
  });
});
