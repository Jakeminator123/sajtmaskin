import { tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { SYSTEM_PROMPT_SEPARATOR } from "@/lib/gen/system-prompt";

const recordLlmUsage = vi.hoisted(() => vi.fn());
const getOpenAIModelMock = vi.hoisted(() => vi.fn());

vi.mock("./models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./models")>();
  return {
    ...actual,
    getOpenAIModel: (...args: unknown[]) => getOpenAIModelMock(...args),
  };
});

vi.mock("@/lib/observability/llm-usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/observability/llm-usage")>();
  return {
    ...actual,
    recordLlmUsage: (...args: unknown[]) => recordLlmUsage(...args),
  };
});

import { generateCode, type GenerateOptions, type ReasoningEffort } from "./engine";
import { parseSSEBuffer } from "./stream/sse-parser";

const SENTINEL = "tool-result:brand-blue-7f3a";
const SYSTEM_PROMPT = `${"You are the site generator. Follow the request. ".repeat(6)}${SYSTEM_PROMPT_SEPARATOR}Build the requested page.`;
const HANG_GUARD = 6;

type V3Usage = {
  inputTokens: { total: number; noCache: number; cacheRead: number; cacheWrite: number };
  outputTokens: { total: number; text: number; reasoning: number };
};

const STEP_ONE: V3Usage = {
  inputTokens: { total: 10, noCache: 6, cacheRead: 3, cacheWrite: 1 },
  outputTokens: { total: 4, text: 2, reasoning: 2 },
};

const STEP_TWO: V3Usage = {
  inputTokens: { total: 20, noCache: 10, cacheRead: 8, cacheWrite: 2 },
  outputTokens: { total: 6, text: 5, reasoning: 1 },
};

type UsageMeta = {
  requestedModelId: string | null;
  resolvedModelId: string;
  requestedReasoningEffort: ReasoningEffort | null;
  effectiveReasoningEffort: string | null;
  reasoningClampReason:
    | "thinking_disabled_minimum"
    | "model_capability_clamp"
    | "provider_effort_mapping"
    | "default_effort"
    | null;
};

let toolExecutions = 0;

const lookupColor = tool({
  description: "Look up a brand color",
  inputSchema: z.object({
    name: z.string(),
  }),
  execute: async () => {
    toolExecutions += 1;
    return { color: SENTINEL };
  },
});

type ModelStreamResult = Awaited<ReturnType<MockLanguageModelV3["doStream"]>>;
type ModelStreamPart = ModelStreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;

function streamResult(parts: readonly ModelStreamPart[]): ModelStreamResult {
  return {
    stream: new ReadableStream({
      start(controller) {
        for (const part of parts) controller.enqueue(part);
        controller.close();
      },
    }),
  };
}

function textParts(text: string, usage: V3Usage): ModelStreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: text },
    { type: "text-end", id: "text-1" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
      usage,
    },
  ];
}

function toolParts(usage: V3Usage, toolCallId: string): ModelStreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    {
      type: "tool-call",
      toolCallId,
      toolName: "lookupColor",
      input: JSON.stringify({ name: "brand" }),
    },
    {
      type: "finish",
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage,
    },
  ];
}

function containsSentinel(value: unknown, seen = new Set<unknown>()): boolean {
  if (typeof value === "string") return value.includes(SENTINEL);
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const entries = Array.isArray(value) ? value : Object.values(value);
  return entries.some((entry) => containsSentinel(entry, seen));
}

async function drain(options: GenerateOptions) {
  const stream = generateCode(options);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Array<{ event: string; data: unknown }> = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSSEBuffer(buffer);
    events.push(...parsed.events);
    buffer = parsed.remaining;
  }
  if (buffer.trim()) {
    const parsed = parseSSEBuffer(`${buffer}\n`);
    events.push(...parsed.events);
  }
  return events;
}

function usageCall() {
  expect(recordLlmUsage).toHaveBeenCalledTimes(1);
  return recordLlmUsage.mock.calls[0][0] as {
    ok?: boolean;
    model?: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      inputTokenDetails?: {
        noCacheTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
      };
      outputTokenDetails?: { textTokens?: number; reasoningTokens?: number };
    };
    meta?: UsageMeta;
  };
}

beforeEach(() => {
  toolExecutions = 0;
  recordLlmUsage.mockReset();
  getOpenAIModelMock.mockReset();
});

describe("generateCode multi-step streamText", () => {
  it("executes the tool, continues, and logs aggregate usage once", async () => {
    const prompts: unknown[] = [];
    getOpenAIModelMock.mockImplementation(
      () =>
        new MockLanguageModelV3({
          doStream: async ({ prompt }) => {
            prompts.push(prompt);
            if (prompts.length === 1) return streamResult(toolParts(STEP_ONE, "call-1"));
            return streamResult(textParts("bakery page", STEP_TWO));
          },
        }),
    );

    const events = await drain({
      prompt: "Build a one-page bakery site.",
      systemPrompt: SYSTEM_PROMPT,
      model: "gpt-5.4",
      thinking: true,
      reasoningEffort: "medium",
      tools: { lookupColor },
      maxSteps: 4,
    });

    expect(prompts).toHaveLength(2);
    expect(toolExecutions).toBe(1);
    expect(containsSentinel(prompts[0])).toBe(false);
    expect(containsSentinel(prompts[1])).toBe(true);
    expect(events.find((event) => event.event === "tool-call")?.data).toMatchObject({
      toolName: "lookupColor",
      toolCallId: "call-1",
      args: { name: "brand" },
    });
    expect(
      events
        .filter((event) => event.event === "content")
        .map((event) => String((event.data as { text?: string }).text ?? ""))
        .join(""),
    ).toBe("bakery page");
    expect(events.find((event) => event.event === "done")?.data).toEqual({
      promptTokens: 30,
      completionTokens: 10,
    });

    const call = usageCall();
    expect(call.ok).toBe(true);
    expect(call.model).toBe("gpt-5.4");
    expect(call.usage).toMatchObject({
      inputTokens: 30,
      outputTokens: 10,
      inputTokenDetails: {
        noCacheTokens: 16,
        cacheReadTokens: 11,
        cacheWriteTokens: 3,
      },
      outputTokenDetails: {
        textTokens: 7,
        reasoningTokens: 3,
      },
    });
    expect(call.meta).toEqual({
      requestedModelId: "gpt-5.4",
      resolvedModelId: "gpt-5.4",
      requestedReasoningEffort: "medium",
      effectiveReasoningEffort: "medium",
      reasoningClampReason: null,
    });
  });

  it("stops repeated tool calls at the configured budget and logs both steps once", async () => {
    const prompts: unknown[] = [];
    getOpenAIModelMock.mockImplementation(
      () =>
        new MockLanguageModelV3({
          doStream: async ({ prompt }) => {
            prompts.push(prompt);
            if (prompts.length > HANG_GUARD) return streamResult(textParts("guard", STEP_ONE));
            const usage = prompts.length === 1 ? STEP_ONE : STEP_TWO;
            return streamResult(toolParts(usage, `call-${prompts.length}`));
          },
        }),
    );

    await drain({
      prompt: "Build a one-page bakery site.",
      systemPrompt: SYSTEM_PROMPT,
      model: "gpt-5.4",
      thinking: false,
      tools: { lookupColor },
      maxSteps: 2,
    });

    expect(prompts).toHaveLength(2);
    expect(toolExecutions).toBe(2);
    expect(containsSentinel(prompts[1])).toBe(true);
    const call = usageCall();
    expect(call.ok).toBe(true);
    expect(call.usage).toMatchObject({
      inputTokens: 30,
      outputTokens: 10,
      inputTokenDetails: { cacheReadTokens: 11, cacheWriteTokens: 3 },
      outputTokenDetails: { reasoningTokens: 3 },
    });
  });

  it("uses four steps when maxSteps is omitted", async () => {
    const prompts: unknown[] = [];
    getOpenAIModelMock.mockImplementation(
      () =>
        new MockLanguageModelV3({
          doStream: async ({ prompt }) => {
            prompts.push(prompt);
            if (prompts.length > HANG_GUARD) return streamResult(textParts("guard", STEP_ONE));
            return streamResult(toolParts(STEP_ONE, `call-${prompts.length}`));
          },
        }),
    );

    await drain({
      prompt: "Build a one-page bakery site.",
      systemPrompt: SYSTEM_PROMPT,
      model: "gpt-5.4",
      thinking: false,
      tools: { lookupColor },
    });

    expect(prompts).toHaveLength(4);
    expect(toolExecutions).toBe(4);
    expect(containsSentinel(prompts[0])).toBe(false);
    expect(containsSentinel(prompts[3])).toBe(true);
    const call = usageCall();
    expect(call.usage).toMatchObject({
      inputTokens: 40,
      outputTokens: 16,
      inputTokenDetails: { cacheReadTokens: 12 },
      outputTokenDetails: { reasoningTokens: 8 },
    });
  });

  it("logs one usage row for a tool-only maxSteps 1 run", async () => {
    const prompts: unknown[] = [];
    getOpenAIModelMock.mockImplementation(
      () =>
        new MockLanguageModelV3({
          doStream: async ({ prompt }) => {
            prompts.push(prompt);
            if (prompts.length > 1) return streamResult(textParts("unexpected", STEP_TWO));
            return streamResult(toolParts(STEP_ONE, "call-1"));
          },
        }),
    );

    const events = await drain({
      prompt: "Build a one-page bakery site.",
      systemPrompt: SYSTEM_PROMPT,
      model: "gpt-6.1-sol",
      thinking: false,
      tools: { lookupColor },
      maxSteps: 1,
    });

    expect(prompts).toHaveLength(1);
    expect(containsSentinel(prompts[0])).toBe(false);
    expect(events.some((event) => event.event === "content")).toBe(false);
    const call = usageCall();
    expect(call.ok).toBe(true);
    expect(call.usage).toMatchObject({
      inputTokens: 10,
      outputTokens: 4,
      inputTokenDetails: { cacheReadTokens: 3, cacheWriteTokens: 1 },
      outputTokenDetails: { reasoningTokens: 2 },
    });
    expect(call.meta).toMatchObject({
      requestedModelId: "gpt-6.1-sol",
      resolvedModelId: "gpt-6.1-sol",
      reasoningClampReason: "thinking_disabled_minimum",
      effectiveReasoningEffort: "low",
    });
  });

  it("logs one usage row when the caller aborts", async () => {
    const abortController = new AbortController();
    abortController.abort();
    getOpenAIModelMock.mockImplementation(
      () =>
        new MockLanguageModelV3({
          doStream: async ({ abortSignal }) => {
            if (abortSignal?.aborted) {
              throw new DOMException("The operation was aborted", "AbortError");
            }
            return streamResult(textParts("should-not-run", STEP_ONE));
          },
        }),
    );

    const events = await drain({
      prompt: "Build a one-page bakery site.",
      systemPrompt: SYSTEM_PROMPT,
      model: "gpt-6.1-sol",
      thinking: false,
      abortSignal: abortController.signal,
    });

    expect(events.some((event) => JSON.stringify(event.data).includes("should-not-run"))).toBe(
      false,
    );
    const call = usageCall();
    expect(call.ok).toBe(false);
    expect(call.meta).toMatchObject({
      requestedModelId: "gpt-6.1-sol",
      effectiveReasoningEffort: "low",
      reasoningClampReason: "thinking_disabled_minimum",
    });
  });

  it("logs one usage row when the model stream throws", async () => {
    getOpenAIModelMock.mockImplementation(
      () =>
        new MockLanguageModelV3({
          doStream: async () => {
            throw new Error("provider exploded");
          },
        }),
    );

    const events = await drain({
      prompt: "Build a one-page bakery site.",
      systemPrompt: SYSTEM_PROMPT,
      model: "gpt-6.1-sol",
      thinking: false,
      reasoningEffort: "high",
    });

    expect(events.some((event) => event.event === "error")).toBe(true);
    const call = usageCall();
    expect(call.ok).toBe(false);
    expect(call.meta).toEqual({
      requestedModelId: "gpt-6.1-sol",
      resolvedModelId: "gpt-6.1-sol",
      requestedReasoningEffort: "high",
      effectiveReasoningEffort: "low",
      reasoningClampReason: "thinking_disabled_minimum",
    });
  });

  it.each([
    {
      name: "thinking off applies the model minimum over a higher request",
      options: { model: "gpt-6.1-sol", thinking: false, reasoningEffort: "xhigh" as const },
      meta: {
        requestedModelId: "gpt-6.1-sol",
        resolvedModelId: "gpt-6.1-sol",
        requestedReasoningEffort: "xhigh",
        effectiveReasoningEffort: "low",
        reasoningClampReason: "thinking_disabled_minimum",
      },
    },
    {
      name: "thinking off with no explicit effort still records the minimum",
      options: { model: "gpt-6.1-sol", thinking: false },
      meta: {
        requestedModelId: "gpt-6.1-sol",
        resolvedModelId: "gpt-6.1-sol",
        requestedReasoningEffort: null,
        effectiveReasoningEffort: "low",
        reasoningClampReason: "thinking_disabled_minimum",
      },
    },
    {
      name: "thinking off keeps the minimum label when the request already matches",
      options: { model: "gpt-6-luna", thinking: false, reasoningEffort: "none" as const },
      meta: {
        requestedModelId: "gpt-6-luna",
        resolvedModelId: "gpt-6-luna",
        requestedReasoningEffort: "none",
        effectiveReasoningEffort: "none",
        reasoningClampReason: "thinking_disabled_minimum",
      },
    },
    {
      name: "thinking on clamps an unsupported effort",
      options: { model: "gpt-6.1-sol", thinking: true, reasoningEffort: "none" as const },
      meta: {
        requestedModelId: "gpt-6.1-sol",
        resolvedModelId: "gpt-6.1-sol",
        requestedReasoningEffort: "none",
        effectiveReasoningEffort: "low",
        reasoningClampReason: "model_capability_clamp",
      },
    },
    {
      name: "thinking on keeps an accepted effort",
      options: { model: "gpt-6.1-sol", thinking: true, reasoningEffort: "high" as const },
      meta: {
        requestedModelId: "gpt-6.1-sol",
        resolvedModelId: "gpt-6.1-sol",
        requestedReasoningEffort: "high",
        effectiveReasoningEffort: "high",
        reasoningClampReason: null,
      },
    },
    {
      name: "anthropic maps effort names",
      options: { model: "claude-opus-4.8", thinking: true, reasoningEffort: "xhigh" as const },
      meta: {
        requestedModelId: "claude-opus-4.8",
        resolvedModelId: "claude-opus-4.8",
        requestedReasoningEffort: "xhigh",
        effectiveReasoningEffort: "max",
        reasoningClampReason: "provider_effort_mapping",
      },
    },
    {
      name: "anthropic thinking off maps effort instead of forcing the minimum label",
      options: { model: "claude-opus-4.8", thinking: false, reasoningEffort: "none" as const },
      meta: {
        requestedModelId: "claude-opus-4.8",
        resolvedModelId: "claude-opus-4.8",
        requestedReasoningEffort: "none",
        effectiveReasoningEffort: "low",
        reasoningClampReason: "provider_effort_mapping",
      },
    },
    {
      name: "anthropic keeps an effort that already matches",
      options: { model: "claude-opus-4.8", thinking: false, reasoningEffort: "medium" as const },
      meta: {
        requestedModelId: "claude-opus-4.8",
        resolvedModelId: "claude-opus-4.8",
        requestedReasoningEffort: "medium",
        effectiveReasoningEffort: "medium",
        reasoningClampReason: null,
      },
    },
    {
      name: "an omitted effort records the default",
      options: { model: "gpt-5.4", thinking: true },
      meta: {
        requestedModelId: "gpt-5.4",
        resolvedModelId: "gpt-5.4",
        requestedReasoningEffort: null,
        effectiveReasoningEffort: "high",
        reasoningClampReason: "default_effort",
      },
    },
    {
      name: "an explicit accepted effort is not a clamp",
      options: { model: "gpt-5.4", thinking: true, reasoningEffort: "medium" as const },
      meta: {
        requestedModelId: "gpt-5.4",
        resolvedModelId: "gpt-5.4",
        requestedReasoningEffort: "medium",
        effectiveReasoningEffort: "medium",
        reasoningClampReason: null,
      },
    },
    {
      name: "an unregistered model with thinking off sends no effort",
      options: { model: "gpt-5.4", thinking: false, reasoningEffort: "high" as const },
      meta: {
        requestedModelId: "gpt-5.4",
        resolvedModelId: "gpt-5.4",
        requestedReasoningEffort: "high",
        effectiveReasoningEffort: null,
        reasoningClampReason: null,
      },
    },
    {
      name: "a retired id is resolved before the capability clamp",
      options: { model: "gpt-5.3-codex", thinking: true, reasoningEffort: "none" as const },
      meta: {
        requestedModelId: "gpt-5.3-codex",
        resolvedModelId: "gpt-6.1-sol",
        requestedReasoningEffort: "none",
        effectiveReasoningEffort: "low",
        reasoningClampReason: "model_capability_clamp",
      },
    },
  ] satisfies Array<{
    name: string;
    options: Pick<GenerateOptions, "model" | "thinking" | "reasoningEffort">;
    meta: UsageMeta;
  }>)("usage meta: $name", async ({ options, meta }) => {
    getOpenAIModelMock.mockImplementation(
      () =>
        new MockLanguageModelV3({
          doStream: async () => streamResult(textParts("ok", STEP_ONE)),
        }),
    );

    const events = await drain({
      prompt: "Build a one-page bakery site.",
      systemPrompt: SYSTEM_PROMPT,
      ...options,
    });

    expect(events.some((event) => event.event === "done")).toBe(true);
    expect(getOpenAIModelMock).toHaveBeenCalledWith(meta.resolvedModelId);
    const call = usageCall();
    expect(call.ok).toBe(true);
    expect(call.model).toBe(meta.resolvedModelId);
    expect(call.meta).toEqual(meta);
  });
});
