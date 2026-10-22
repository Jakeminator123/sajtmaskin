// @vitest-environment node
import { generateText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDirectModel } from "@/lib/builder/direct-model";
import {
  buildPromptAssistMessages,
  buildPromptAssistModelOptions,
  resolvePromptRewriteModel,
} from "@/lib/builder/prompt-assist-pre-send";
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

  it("serializes prompt-assist as Sol 6.1 low with an 8192 cap and no sampling", async () => {
    const previous = process.env.SAJTMASKIN_PROMPT_REWRITE_MODEL;
    delete process.env.SAJTMASKIN_PROMPT_REWRITE_MODEL;
    const captured = captureOpenAIRequests();
    try {
      const modelId = resolvePromptRewriteModel();
      const messages = buildPromptAssistMessages("cafe malmo");
      await generateText({
        model: createDirectModel(modelId),
        messages: [
          { role: "system", content: messages.system },
          { role: "user", content: messages.user },
        ],
        ...buildPromptAssistModelOptions(modelId),
      });

      expect(modelId).toBe("openai/gpt-6.1-sol");
      expect(captured).toHaveLength(1);
      expect(captured[0].url).toMatch(/\/v1\/responses$/);
      expect(captured[0].body.model).toBe("gpt-6.1-sol");
      expect(captured[0].body.reasoning).toEqual({ effort: "low" });
      expect(captured[0].body.max_output_tokens).toBe(8192);
      expect(captured[0].body).not.toHaveProperty("temperature");
      expect(captured[0].body).not.toHaveProperty("top_p");
      expect(captured[0].body.reasoning).not.toEqual({ effort: "none" });
    } finally {
      if (previous === undefined) delete process.env.SAJTMASKIN_PROMPT_REWRITE_MODEL;
      else process.env.SAJTMASKIN_PROMPT_REWRITE_MODEL = previous;
    }
  });

  it.each(["openai/gpt-5.6-terra", "openai/gpt-4o-mini", "openai/gpt-4.1"])("sends explicit rewrite override %s at its resolved workload effort", async (override) => {
    const previous = process.env.SAJTMASKIN_PROMPT_REWRITE_MODEL;
    process.env.SAJTMASKIN_PROMPT_REWRITE_MODEL = override;
    const expectedModel = override === "openai/gpt-5.6-terra" ? "gpt-5.6-terra" : "gpt-6.1-sol";
    const captured = captureOpenAIRequests();
    try {
      const modelId = resolvePromptRewriteModel();
      expect(modelId).toBe(override);
      await generateText({
        model: createDirectModel(modelId),
        prompt: "hej",
        ...buildPromptAssistModelOptions(modelId),
      });

      expect(captured).toHaveLength(1);
      expect(captured[0].body.model).toBe(expectedModel);
      expect(captured[0].body.reasoning).toEqual({ effort: "low" });
      expect(captured[0].body.max_output_tokens).toBe(8192);
      expect(captured[0].body).not.toHaveProperty("temperature");
      expect(captured[0].body).not.toHaveProperty("top_p");
    } finally {
      if (previous === undefined) delete process.env.SAJTMASKIN_PROMPT_REWRITE_MODEL;
      else process.env.SAJTMASKIN_PROMPT_REWRITE_MODEL = previous;
    }
  });

  it("does not substitute another model when the provider fails", async () => {
    const previous = process.env.SAJTMASKIN_PROMPT_REWRITE_MODEL;
    delete process.env.SAJTMASKIN_PROMPT_REWRITE_MODEL;
    const captured: CapturedRequest[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        captured.push({ url: String(input), body });
        return new Response(JSON.stringify({ error: { message: "provider down" } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    try {
      const modelId = resolvePromptRewriteModel();
      await expect(
        generateText({
          model: createDirectModel(modelId),
          prompt: "hej",
          maxRetries: 0,
          ...buildPromptAssistModelOptions(modelId),
        }),
      ).rejects.toThrow();
      expect(captured.length).toBeGreaterThan(0);
      expect(captured.map((request) => request.body.model)).toEqual(["gpt-6.1-sol"]);
    } finally {
      if (previous === undefined) delete process.env.SAJTMASKIN_PROMPT_REWRITE_MODEL;
      else process.env.SAJTMASKIN_PROMPT_REWRITE_MODEL = previous;
    }
  });
});
