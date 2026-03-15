import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getOpenClawSurfaceStatus = vi.hoisted(() => vi.fn());
const decideOpenClawCodeContextMode = vi.hoisted(() => vi.fn());
const resolveFileContext = vi.hoisted(() => vi.fn());
const OPENCLAW = vi.hoisted(() => ({
  gatewayUrl: "https://gateway.example",
  gatewayToken: "test-token",
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (
    _req: Request,
    _bucket: string,
    handler: () => Promise<Response>,
  ) => handler(),
}));

vi.mock("@/lib/config", () => ({
  OPENCLAW,
}));

vi.mock("@/lib/openclaw/status", () => ({
  getOpenClawSurfaceStatus,
}));

vi.mock("@/lib/openclaw/chat-context-policy", () => ({
  decideOpenClawCodeContextMode,
}));

vi.mock("@/lib/openclaw/resolve-file-context", () => ({
  resolveFileContext,
}));

import { POST } from "@/app/api/openclaw/chat/route";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/openclaw/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("OpenClaw chat route", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockReset();
    getOpenClawSurfaceStatus.mockReset();
    decideOpenClawCodeContextMode.mockReset();
    resolveFileContext.mockReset();

    getOpenClawSurfaceStatus.mockReturnValue({
      surfaceEnabled: true,
      surfaceStatus: "enabled",
      blockers: [],
    });
    decideOpenClawCodeContextMode.mockReturnValue("snippet");
    resolveFileContext.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 503 when the OpenClaw surface is disabled", async () => {
    getOpenClawSurfaceStatus.mockReturnValue({
      surfaceEnabled: false,
      surfaceStatus: "disabled_missing_token",
      blockers: ["OPENCLAW_GATEWAY_TOKEN is not configured"],
    });

    const res = await POST(buildRequest({ messages: [{ role: "user", content: "Hej" }] }) as never);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data).toMatchObject({
      error: "OpenClaw surface disabled",
      surfaceStatus: "disabled_missing_token",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies a streaming gateway response", async () => {
    fetchMock.mockResolvedValue(
      new Response("data: hej\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const res = await POST(
      buildRequest({
        messages: [{ role: "user", content: "Skriv en kort hälsning" }],
        context: {
          page: "builder",
          currentCode: "export default function Page() { return <main />; }",
        },
      }) as never,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    await expect(res.text()).resolves.toContain("data: hej");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(options.body));

    expect(url).toBe("https://gateway.example/v1/chat/completions");
    expect(payload.model).toBe("openclaw:sajtagenten");
    expect(payload.stream).toBe(true);
    expect(payload.messages[0].content).toContain("Du är Sajtagenten");
  });
});
