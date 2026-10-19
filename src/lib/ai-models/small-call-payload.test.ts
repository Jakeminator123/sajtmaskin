// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBriefingEnvKeysFromManifest } from "@/lib/ai-models/load-manifest";
import { recordLlmUsage } from "@/lib/observability/llm-usage";

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-test" })),
}));
vi.mock("@/lib/builder/inspector-feature", () => ({
  isBuilderInspectorEnabled: () => true,
  getBuilderInspectorDisabledMessage: () => "Avstängd",
}));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: async (
    _req: Request,
    _endpoint: string,
    handler: () => Promise<Response>,
  ) => handler(),
}));
vi.mock("@/lib/observability/llm-usage", () => ({
  recordLlmUsage: vi.fn(),
}));

import { POST as inspectorPost } from "@/app/api/inspector-ai-match/route";
import { llmClassifyFollowUpIntent } from "@/lib/providers/own-engine/follow-up-intent-llm-classifier";
import { generateQueriesWithLlm, rankCandidatesWithLlm } from "@/lib/shadcn/describe";

type CapturedRequest = { url: string; body: Record<string, unknown> };

function responsesReply(model: string, text: string) {
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
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    incomplete_details: null,
    usage: {
      input_tokens: 1,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 6100,
      output_tokens_details: { reasoning_tokens: 6000 },
      total_tokens: 6101,
    },
  };
}

function chatReply(model: string, content: string) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 3,
      completion_tokens: 8,
      total_tokens: 11,
      prompt_tokens_details: { cached_tokens: 0 },
    },
  };
}

async function readCaptured(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<CapturedRequest> {
  if (typeof Request !== "undefined" && input instanceof Request) {
    const text = await input.clone().text();
    return {
      url: input.url,
      body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
    };
  }
  const url = input instanceof URL ? input.toString() : String(input);
  const raw = init?.body;
  let text = "{}";
  if (typeof raw === "string") text = raw || "{}";
  else if (raw instanceof Uint8Array) text = new TextDecoder().decode(raw) || "{}";
  else if (raw != null) text = String(raw) || "{}";
  return { url, body: JSON.parse(text) as Record<string, unknown> };
}

/** Real SDK serialization. Global fetch never leaves the test. */
function installFetch(options?: { status?: number; text?: string }): CapturedRequest[] {
  const captured: CapturedRequest[] = [];
  const status = options?.status ?? 200;
  const text = options?.text ?? "{\"intent\":\"neutral\"}";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = await readCaptured(input, init);
      captured.push(request);
      if (status !== 200) {
        return new Response(
          JSON.stringify({ error: { message: "provider down", type: "server_error" } }),
          { status, headers: { "content-type": "application/json" } },
        );
      }
      const model = String(request.body.model ?? "");
      const payload = request.url.includes("/chat/completions")
        ? chatReply(model, text)
        : responsesReply(model, text);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return captured;
}

function inspectorRequest(): Request {
  return new Request("http://localhost/api/inspector-ai-match", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      xPercent: 12,
      yPercent: 34,
      viewportWidth: 1280,
      viewportHeight: 720,
      files: [
        {
          name: "app/page.tsx",
          content: "export default function Page(){return <button>Hej</button>}",
        },
      ],
    }),
  });
}

describe("small-call payloads", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const keys = getBriefingEnvKeysFromManifest();
    vi.stubEnv(keys.serverAutoOpenAI, "");
    vi.stubEnv(keys.serverAutoAnthropic, "");
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("inspector POST sends raw Chat Sol medium with an 8192 ceiling", async () => {
    const captured = installFetch({
      text: JSON.stringify({
        tag: "button",
        text: "Hej",
        className: null,
        filePath: "app/page.tsx",
        lineNumber: 1,
        confidence: "high",
        reasoning: "Knappen.",
      }),
    });
    const response = await inspectorPost(inspectorRequest());
    const json = (await response.json()) as { success?: boolean; element?: { tag?: string } };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.element?.tag).toBe("button");
    expect(captured).toHaveLength(1);
    expect(captured[0]?.url).toMatch(/\/v1\/chat\/completions$/);
    expect(captured[0]?.body.model).toBe("gpt-6.1-sol");
    expect(captured[0]?.body.reasoning_effort).toBe("medium");
    expect(captured[0]?.body.max_completion_tokens).toBe(8192);
    expect(captured[0]?.body).not.toHaveProperty("max_tokens");
    expect(captured[0]?.body).not.toHaveProperty("temperature");
  });

  it("preserves the classic inspector override's 300-token cap and sampling", async () => {
    vi.resetModules();
    vi.doMock("@/lib/gen/defaults", async (importOriginal) => ({
      ...await importOriginal<typeof import("@/lib/gen/defaults")>(),
      INSPECTOR_AI_MATCH_DEFAULT_MODEL: "gpt-4o",
    }));
    const captured = installFetch({ text: JSON.stringify({ tag: "button", confidence: "high" }) });
    try {
      const { POST } = await import("@/app/api/inspector-ai-match/route");
      expect((await POST(inspectorRequest())).status).toBe(200);
      expect(captured).toHaveLength(1);
      expect(captured[0].body).toMatchObject({
        model: "gpt-4o", max_tokens: 300, temperature: 0.1,
      });
      expect(captured[0].body).not.toHaveProperty("reasoning_effort");
      expect(captured[0].body).not.toHaveProperty("max_completion_tokens");
    } finally {
      vi.doUnmock("@/lib/gen/defaults");
      vi.resetModules();
    }
  });

  it("inspector provider failure does not fabricate a successful match", async () => {
    const captured = installFetch({ status: 500 });
    const response = await inspectorPost(inspectorRequest());
    const json = (await response.json()) as { success?: boolean; element?: unknown };

    expect(response.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.element).toBeUndefined();
    expect(captured.length).toBeGreaterThan(0);
    expect(captured.every((request) => request.body.model === "gpt-6.1-sol")).toBe(true);
    expect(captured.some((request) => String(request.body.model).includes("luna"))).toBe(false);
  });

  it("llmClassifyFollowUpIntent sends Responses Sol medium with max_output_tokens 8192", async () => {
    const captured = installFetch({ text: "{\"intent\":\"neutral\"}" });
    await expect(llmClassifyFollowUpIntent("hej")).resolves.toBe("neutral");

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]?.url).toMatch(/\/v1\/responses$/);
    expect(captured[0]?.body.model).toBe("gpt-6.1-sol");
    expect(captured[0]?.body.reasoning).toEqual({ effort: "medium" });
    expect(captured[0]?.body.max_output_tokens).toBe(8192);
    expect(captured[0]?.body).not.toHaveProperty("temperature");
    expect(captured[0]?.body.reasoning).not.toEqual({ effort: "low" });
    // Synthetic headroom contract, not a live consumption measurement: the
    // real SDK parses both 6000 reasoning and 100 visible output tokens while
    // the caller still returns the intended visible result within its cap.
    const usage = vi.mocked(recordLlmUsage).mock.calls.at(-1)?.[0].usage;
    expect(usage).toMatchObject({
      outputTokens: 6100,
      outputTokenDetails: { reasoningTokens: 6000, textTokens: 100 },
    });
    expect(Number(captured[0]?.body.max_output_tokens)).toBeGreaterThanOrEqual(6100);
  });

  it("does not invent reasoning effort low for an unregistered classic override", async () => {
    const captured = installFetch({ text: "{\"intent\":\"clear-refine\"}" });
    await expect(
      llmClassifyFollowUpIntent("byt rubriken", { model: "gpt-4o" }),
    ).resolves.toBe("clear-refine");

    expect(captured).toHaveLength(1);
    expect(captured[0]?.url).toMatch(/\/v1\/responses$/);
    expect(captured[0]?.body.model).toBe("gpt-4o");
    expect(captured[0]?.body.reasoning_effort).toBeUndefined();
    expect(captured[0]?.body.reasoning).toBeUndefined();
    expect(JSON.stringify(captured[0]?.body)).not.toContain('"effort":"low"');
    expect(JSON.stringify(captured[0]?.body)).not.toContain('"reasoningEffort":"low"');
  });

  it("classifier provider failure stays on Sol and does not return an intent", async () => {
    const captured = installFetch({ status: 500 });
    await expect(llmClassifyFollowUpIntent("gör om sidan")).rejects.toThrow();
    expect(captured.length).toBeGreaterThan(0);
    expect(captured.every((request) => request.body.model === "gpt-6.1-sol")).toBe(true);
    expect(captured.some((request) => String(request.body.model).includes("luna"))).toBe(false);
  });

  it("shadcn query and ranking use Sol medium and an 8192 ceiling", async () => {
    const queryCaptured = installFetch({ text: "{\"queries\":[\"pricing table\"]}" });
    await expect(generateQueriesWithLlm("pricing table")).resolves.toEqual(["pricing table"]);
    expect(queryCaptured[0]?.url).toMatch(/\/v1\/responses$/);
    expect(queryCaptured[0]?.body.model).toBe("gpt-6.1-sol");
    expect(queryCaptured[0]?.body.reasoning).toEqual({ effort: "medium" });
    expect(queryCaptured[0]?.body.max_output_tokens).toBe(8192);
    expect(queryCaptured[0]?.body).not.toHaveProperty("temperature");

    const rankCaptured = installFetch({
      text: "{\"picks\":[{\"index\":0,\"reason\":\"matches pricing\"}]}",
    });
    const ranked = await rankCandidatesWithLlm(
      "pricing table",
      [
        {
          name: "pricing-table",
          registry: "@shadcn",
          description: "A pricing table",
          addCommand: "npx shadcn@latest add pricing-table",
        },
      ],
      1,
    );
    expect(ranked.ranking).toBe("llm");
    expect(ranked.candidates[0]?.reason).toBe("matches pricing");
    expect(rankCaptured[0]?.body.model).toBe("gpt-6.1-sol");
    expect(rankCaptured[0]?.body.reasoning).toEqual({ effort: "medium" });
    expect(rankCaptured[0]?.body.max_output_tokens).toBe(8192);
  });
});
