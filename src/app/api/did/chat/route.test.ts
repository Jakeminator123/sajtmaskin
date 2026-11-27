import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const answerReadTask = vi.hoisted(() => vi.fn());
vi.mock("@/lib/openclaw/read-task", () => ({ answerOpenClawReadTask: answerReadTask }));

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
  it("returns the readable answer separately from citations for the avatar", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    answerReadTask.mockResolvedValue(Response.json({ answer: "En bok.", sources: ["https://example.org/"] }));
    const request = new NextRequest("http://localhost/api/did/chat", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "reader", message: "Sök på webben efter en bok", readTask: { search: true },
        context: { chatId: "chat-own" },
        recentMessages: [{ role: "user", content: "Jag bygger en sajt om böcker." }],
      }),
    });

    const response = await POST(request);
    expect(await response.json()).toMatchObject({ success: true, reply: "En bok.", sources: ["https://example.org/"] });
    expect(answerReadTask).toHaveBeenCalledWith(request, { search: true }, "Sök på webben efter en bok", {
      history: [{ role: "user", content: "Jag bygger en sajt om böcker." }],
      context: { chatId: "chat-own" }, spoken: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

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

  it("does not expose gateway failure details", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("connect ECONNREFUSED gateway.internal:443 token=secret"),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/did/chat", {
        method: "POST",
        body: JSON.stringify({ sessionId: "session-1", message: "Hej" }),
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Gateway unreachable",
      detail: "Upstream request failed",
    });
  });
});
