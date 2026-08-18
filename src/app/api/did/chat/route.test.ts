import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  OPENCLAW: {
    gatewayUrl: "https://gateway.example",
    gatewayToken: "secret",
    modelRoutingEnabled: true,
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: async (
    _req: NextRequest,
    _key: string,
    callback: () => Promise<Response>,
  ) => callback(),
}));

vi.mock("@/lib/openclaw/status", () => ({
  getOpenClawSurfaceStatus: () => ({ surfaceEnabled: true }),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest: vi.fn(),
  getEngineVersionForChatByIdForRequest: vi.fn(),
}));

vi.mock("@/lib/openclaw/server-context", () => ({
  buildOpenClawContextSystemMessage: vi.fn(async () => ({
    content: "context",
    codeContextMode: "none",
  })),
}));

import { POST } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/did/chat", () => {
  it("keeps client sessionId out of OpenClaw persistence while sharing model routing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ choices: [{ message: { content: "Hej!" } }] }),
    );
    const request = new NextRequest("http://localhost/api/did/chat", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "shared-client-id",
        message: "En enkel fråga",
        recentMessages: [{ role: "assistant", content: "Tidigare svar" }],
      }),
    });

    const response = await POST(request);
    const payload = await response.json();
    const upstreamBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(response.status).toBe(200);
    expect(payload.sessionId).toBe("shared-client-id");
    expect(upstreamBody).not.toHaveProperty("user");
    expect(upstreamBody.model).toBe("openclaw:sajtagenten-fast");
  });
});
