// @vitest-environment node
/**
 * Offline contract for the standalone openai-chat dossier route.
 * The locked AI SDK builds the request; only fetch is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../../../data/dossiers/hard/openai-chat/components/api/chat/route";

const savedOpenAiKey = process.env.OPENAI_API_KEY;
const SECRET = "SHOULD-NOT-LEAK";
const SAFE_PROVIDER_ERROR = "The assistant could not answer. Try again.";

type FetchMock = ReturnType<typeof vi.fn>;

let fetchMock: FetchMock;

function restoreOpenAiKey(): void {
  if (savedOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedOpenAiKey;
}

function chatRequest(options?: { body?: string; signal?: AbortSignal; text?: string }): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body:
      options?.body ??
      JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: options?.text ?? "Hej" }],
          },
        ],
      }),
    signal: options?.signal,
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function bodyText(body: BodyInit | null | undefined): string {
  if (typeof body === "string") return body;
  if (body == null) return "{}";
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
  return String(body);
}

function jsonBody(body: BodyInit | null | undefined): Record<string, unknown> {
  const parsed: unknown = JSON.parse(bodyText(body));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("expected JSON object body");
  }
  return parsed as Record<string, unknown>;
}

function expectSolPayload(body: Record<string, unknown>): void {
  expect(body.model).toBe("gpt-6.1-sol");
  expect(body.reasoning).toEqual({ effort: "medium" });
  expect(body.max_output_tokens).toBe(8192);
  expect(body).not.toHaveProperty("temperature");
  expect(body).not.toHaveProperty("top_p");
}

function sse(events: unknown[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

function sseResponse(text: string): Response {
  return new Response(
    sse([
      {
        type: "response.output_text.delta",
        item_id: "msg_test",
        output_index: 0,
        content_index: 0,
        delta: text,
      },
      {
        type: "response.output_text.done",
        item_id: "msg_test",
        output_index: 0,
        content_index: 0,
        text,
      },
      {
        type: "response.completed",
        response: {
          id: "resp_test",
          object: "response",
          created_at: 0,
          status: "completed",
          model: "gpt-6.1-sol",
          output: [
            {
              type: "message",
              id: "msg_test",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text, annotations: [] }],
            },
          ],
          usage: {
            input_tokens: 1,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 1,
            output_tokens_details: { reasoning_tokens: 0 },
            total_tokens: 2,
          },
        },
      },
    ]),
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    },
  );
}

async function responseText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("openai-chat dossier route", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    fetchMock = vi.fn(async () => {
      throw new Error("unexpected network");
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreOpenAiKey();
  });

  it("sends Sol, medium effort and the output budget, then streams the UI protocol", async () => {
    let url = "";
    let authorization: string | null = null;
    let payload: Record<string, unknown> | undefined;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      url = requestUrl(input);
      authorization = new Headers(init?.headers).get("authorization");
      payload = jsonBody(init?.body);
      return sseResponse("Hej");
    });

    const res = await POST(chatRequest({ text: "Hej" }));
    const text = await responseText(res);

    expect(url).toMatch(/\/v1\/responses$/);
    expect(authorization).toBe("Bearer test-key");
    if (!payload) throw new Error("missing provider payload");
    expectSolPayload(payload);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(text).toContain("text-delta");
    expect(text).toContain("Hej");
  });

  it("forwards the request abort signal on the provider fetch", async () => {
    const controller = new AbortController();
    let signalLinked = false;
    let payload: Record<string, unknown> | undefined;
    fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      payload = jsonBody(init?.body);
      const signal = init?.signal;
      const wasAborted = signal?.aborted === true;
      controller.abort();
      signalLinked = Boolean(signal) && !wasAborted && signal.aborted === true;
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });

    const res = await POST(chatRequest({ signal: controller.signal }));
    const text = await responseText(res);

    expect(signalLinked).toBe(true);
    if (!payload) throw new Error("missing provider payload");
    expectSolPayload(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("test-key");
  });

  it.each([
    ["missing", undefined],
    ["placeholder", "sk-placeholder-preview-not-real"],
  ])("streams a marked demo and does not call the provider when the key is %s", async (_label, key) => {
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;

    const res = await POST(chatRequest());
    const text = await responseText(res);

    expect(res.status).toBe(200);
    expect(text).toContain("text-delta");
    expect(text).toContain("demo-assistent");
    expect(text).toContain("inte ett riktigt AI-svar");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON before any provider call", async () => {
    const res = await POST(chatRequest({ body: "{" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides a provider HTTP error and does not retry", async () => {
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ error: { message: `${SECRET} upstream` } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await POST(chatRequest());
    const text = await responseText(res);

    expect(text).toContain(SAFE_PROVIDER_ERROR);
    expect(text).not.toContain(SECRET);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hides a thrown provider error", async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error(`${SECRET} connection reset`);
    });

    const res = await POST(chatRequest());
    const text = await responseText(res);

    expect(text).toContain(SAFE_PROVIDER_ERROR);
    expect(text).not.toContain(SECRET);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not call the provider when the request is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const res = await POST(chatRequest({ signal: controller.signal }));

    expect(res.status).toBe(499);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
