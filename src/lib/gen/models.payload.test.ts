// @vitest-environment node
import { generateText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workloadOpenAIProviderOptions } from "@/lib/ai-models/workload-reasoning";
import { createDirectModel } from "@/lib/builder/direct-model";
import { getOpenAIModel } from "./models";

type CapturedRequest = { url: string; body: Record<string, unknown> };

function responsesApiReply(model: string) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 0,
    status: "completed",
    model,
    output: [
      {
        type: "message",
        id: "msg_test",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "ok", annotations: [] }],
      },
    ],
    incomplete_details: null,
    usage: {
      input_tokens: 1,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 1,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 2,
    },
  };
}

/** Real locked `@ai-sdk/openai` serialization; only the network is faked. */
function captureOpenAIRequests(): CapturedRequest[] {
  const captured: CapturedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      captured.push({ url: String(input), body });
      return new Response(JSON.stringify(responsesApiReply(String(body.model))), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return captured;
}

describe("OpenAI request payloads for the GPT-6 models", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends GPT-6.1 Sol to /responses with explicit effort and no temperature", async () => {
    const captured = captureOpenAIRequests();

    await generateText({
      model: getOpenAIModel("gpt-6.1-sol"),
      prompt: "hej",
      temperature: 0.3,
      providerOptions: { openai: { reasoningEffort: "low" } },
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toMatch(/\/v1\/responses$/);
    expect(captured[0].body.model).toBe("gpt-6.1-sol");
    expect(captured[0].body.reasoning).toEqual({ effort: "low" });
    expect(captured[0].body).not.toHaveProperty("temperature");
  });

  it("sends a workload's `none` effort to GPT-6 Luna through the direct-model factory", async () => {
    const captured = captureOpenAIRequests();

    await generateText({
      model: createDirectModel("openai/gpt-6-luna"),
      prompt: "hej",
      ...workloadOpenAIProviderOptions("prompt_rewrite", "openai/gpt-6-luna"),
    });

    expect(captured[0].url).toMatch(/\/v1\/responses$/);
    expect(captured[0].body.model).toBe("gpt-6-luna");
    expect(captured[0].body.reasoning).toEqual({ effort: "none" });
  });

  it("never sends `none` to GPT-6.1 Sol from a `none` workload", async () => {
    const captured = captureOpenAIRequests();

    await generateText({
      model: createDirectModel("openai/gpt-6.1-sol"),
      prompt: "hej",
      ...workloadOpenAIProviderOptions("prompt_rewrite", "openai/gpt-6.1-sol"),
    });

    expect(captured[0].body.reasoning).toEqual({ effort: "low" });
  });
});
