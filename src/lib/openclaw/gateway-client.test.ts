import { afterEach, describe, expect, it, vi } from "vitest";
import { postOpenClawChatCompletion } from "./gateway-client";
import { resolveOpenClawModelRoute } from "./model-routing";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("postOpenClawChatCompletion", () => {
  const fastRoute = resolveOpenClawModelRoute({
    enabled: true,
    surface: "tips",
    routingIntent: "general",
  });

  it("targets the server-selected agent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await postOpenClawChatCompletion({
      gatewayUrl: "https://gateway.example",
      gatewayToken: "secret",
      route: fastRoute,
      body: { messages: [], stream: false },
      timeoutMs: 1_000,
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.model).toBe("openclaw:sajtagenten-fast");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://gateway.example/v1/chat/completions");
  });

  it("requires the gateway to acknowledge a Fast request on its dedicated path", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("stream", { headers: { "x-sajtmaskin-fast-mode": "1" } }))
      .mockResolvedValueOnce(new Response("older gateway"));
    const request = {
      gatewayUrl: "https://gateway.example",
      gatewayToken: "secret",
      route: fastRoute,
      body: { messages: [], stream: true },
      timeoutMs: 1_000,
      fastMode: true,
    };
    const on = await postOpenClawChatCompletion(request);
    expect(on.response.ok).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://gateway.example/v1/chat/completions/fast");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).model).toBe("openclaw:sajtagenten-fast");
    const unacknowledged = await postOpenClawChatCompletion(request);
    expect(unacknowledged.response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries only an unknown routed agent once on the strong agent", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Unknown agent 'sajtagenten-fast'." }), {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await postOpenClawChatCompletion({
      gatewayUrl: "https://gateway.example",
      gatewayToken: "secret",
      route: fastRoute,
      body: { messages: [], stream: false },
      timeoutMs: 1_000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).model).toBe(
      "openclaw:sajtagenten",
    );
    expect(result.fellBackToStrong).toBe(true);
  });

  it.each([401, 429, 500])("does not retry status %s", async (status) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("failure", { status }),
    );

    await postOpenClawChatCompletion({
      gatewayUrl: "https://gateway.example",
      gatewayToken: "secret",
      route: fastRoute,
      body: { messages: [], stream: false },
      timeoutMs: 1_000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
