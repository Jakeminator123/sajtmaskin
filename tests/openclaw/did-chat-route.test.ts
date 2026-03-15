import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getOpenClawSurfaceStatus = vi.hoisted(() => vi.fn());
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

import { POST } from "@/app/api/did/chat/route";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/did/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("D-ID OpenClaw chat bridge route", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    getOpenClawSurfaceStatus.mockReset();
    getOpenClawSurfaceStatus.mockReturnValue({
      surfaceEnabled: true,
      surfaceStatus: "enabled",
      blockers: [],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 503 when the OpenClaw surface is disabled", async () => {
    getOpenClawSurfaceStatus.mockReturnValue({
      surfaceEnabled: false,
      surfaceStatus: "disabled_missing_flag",
      blockers: ["IMPLEMENT_UNDERSCORE_CLAW is not enabled"],
    });

    const res = await POST(buildRequest({ message: "Hej" }) as never);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data).toMatchObject({
      success: false,
      error: "OpenClaw surface disabled",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when no user message is provided", async () => {
    const res = await POST(buildRequest({ recentMessages: [] }) as never);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toMatchObject({
      success: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards sanitized history to the gateway and returns the assistant reply", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Hej! Jag hjälper dig vidare härifrån.",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const res = await POST(
      buildRequest({
        sessionId: "sess_123",
        message: " Hjälp mig att komma vidare ",
        recentMessages: [
          { role: "assistant", content: "Tidigare svar" },
          { role: "user", content: "Tidigare fråga" },
          { role: "system", content: "ska filtreras bort" },
        ],
      }) as never,
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      provider: "openclaw-avatar-bridge",
      reply: "Hej! Jag hjälper dig vidare härifrån.",
      sessionId: "sess_123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(options.body));

    expect(url).toBe("https://gateway.example/v1/chat/completions");
    expect(payload.model).toBe("openclaw:sajtagenten");
    expect(payload.stream).toBe(false);
    expect(payload.user).toBe("sess_123");
    expect(payload.messages[0].role).toBe("system");
    expect(payload.messages[1]).toMatchObject({ role: "assistant", content: "Tidigare svar" });
    expect(payload.messages[2]).toMatchObject({ role: "user", content: "Tidigare fråga" });
    expect(payload.messages[3]).toMatchObject({
      role: "user",
      content: "Hjälp mig att komma vidare",
    });
  });
});
