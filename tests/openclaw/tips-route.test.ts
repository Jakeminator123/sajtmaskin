import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prepareCredits = vi.hoisted(() => vi.fn());
const getOpenClawSurfaceStatus = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/credits/server", () => ({
  prepareCredits,
}));

vi.mock("@/lib/openclaw/status", () => ({
  getOpenClawSurfaceStatus,
}));

vi.mock("@/lib/openclaw/resolve-file-context", () => ({
  resolveFileContext,
}));

import { POST } from "@/app/api/openclaw/tips/route";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/openclaw/tips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("OpenClaw tips route", () => {
  const fetchMock = vi.fn();
  const commitCredits = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockReset();
    commitCredits.mockReset();
    prepareCredits.mockReset();
    getOpenClawSurfaceStatus.mockReset();
    resolveFileContext.mockReset();

    getOpenClawSurfaceStatus.mockReturnValue({
      surfaceEnabled: true,
      surfaceStatus: "enabled",
      blockers: [],
    });
    prepareCredits.mockResolvedValue({
      ok: true,
      commit: commitCredits,
      cost: 2,
    });
    resolveFileContext.mockResolvedValue({
      manifest: "src/app/page.tsx",
      files: [],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 503 when the OpenClaw surface is disabled", async () => {
    getOpenClawSurfaceStatus.mockReturnValue({
      surfaceEnabled: false,
      surfaceStatus: "disabled_missing_gateway",
      blockers: ["OPENCLAW_GATEWAY_URL is not configured"],
    });

    const res = await POST(buildRequest({ context: {} }) as never);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data).toMatchObject({
      success: false,
      error: "OpenClaw surface disabled",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes tip text and commits credits after a successful gateway response", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Öppna SEO-panelen och lägg till en tydlig titel.",
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
        context: {
          page: "builder",
          chatId: "chat_123",
          activeVersionId: "ver_123",
          latestUserMessage: "Jag vill få sidan tydligare.",
        },
      }) as never,
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      cost: 2,
    });
    expect(data.tip).toContain("Launch readiness-kortet");
    expect(commitCredits).toHaveBeenCalledTimes(1);
    expect(resolveFileContext).toHaveBeenCalledWith("chat_123", "ver_123");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(options.body));

    expect(url).toBe("https://gateway.example/v1/chat/completions");
    expect(payload.model).toBe("openclaw:sajtagenten");
    expect(payload.stream).toBe(false);
    expect(payload.messages[1].content).toContain("[FILMANIFEST]");
    expect(payload.messages[1].content).toContain("src/app/page.tsx");
  });
});
