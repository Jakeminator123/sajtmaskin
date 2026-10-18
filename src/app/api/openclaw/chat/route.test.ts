import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  surfaceStatus: { surfaceEnabled: true, surfaceStatus: "ready", blockers: [] as string[] },
  gateway: vi.fn(),
  validateMessages: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  OPENCLAW: {
    gatewayUrl: "https://gateway.example",
    gatewayToken: "secret",
    debugEnabled: false,
    editEnabled: false,
    modelRoutingEnabled: false,
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (...args: unknown[]) => mocks.withRateLimit(...args),
}));
vi.mock("@/lib/openclaw/status", () => ({
  getOpenClawSurfaceStatus: () => mocks.surfaceStatus,
}));
vi.mock("@/lib/openclaw/powers", () => ({
  resolveOpenClawPowersFromRequest: () => ({ any: false }),
}));
vi.mock("@/lib/openclaw/live-review-access", () => ({
  isLiveReviewAutoGrantEnabled: () => false,
  isLiveReviewEnabled: () => false,
  shouldAttachOpenClawLiveReviewContext: () => false,
}));
vi.mock("@/lib/db/services/live-review-grants", () => ({ readLiveReviewGrant: vi.fn() }));
vi.mock("@/lib/openclaw/edit-system-prompt", () => ({
  buildOpenClawEditSystemPrompt: () => null,
}));
vi.mock("@/lib/openclaw/server-context", () => ({
  buildOpenClawContextSystemMessage: vi.fn(),
}));
vi.mock("@/lib/openclaw/review-context", () => ({ buildOpenClawReviewContext: vi.fn() }));
vi.mock("@/lib/openclaw/preview-log-context", () => ({
  buildOpenClawPreviewLogBlock: vi.fn(),
}));
vi.mock("@/lib/openclaw/gateway-client", () => ({
  postOpenClawChatCompletion: (...args: unknown[]) => mocks.gateway(...args),
}));
vi.mock("@/lib/openclaw/model-routing", () => ({
  resolveOpenClawModelRoute: () => ({ lane: "primary", model: "test" }),
}));
vi.mock("@/lib/openclaw/message-validation", () => ({
  validateOpenClawChatMessages: (...args: unknown[]) => mocks.validateMessages(...args),
}));
vi.mock("@/lib/openclaw/chat-context-policy", () => ({
  decideOpenClawRoutingIntent: () => "general",
  getLatestOpenClawUserText: () => "hej",
  OPENCLAW_ROUTING_STRATEGY: "test",
}));
vi.mock("@/lib/openclaw/debug/repo-context", () => ({
  buildOpenClawRepoContextBlock: vi.fn(),
  isRepoContextConfigured: () => false,
}));
vi.mock("@/lib/openclaw/debug/owner-token", () => ({
  matchesOpenClawDebugToken: () => false,
}));
vi.mock("@/lib/db/services/debug-findings", () => ({ queryDebugFindings: vi.fn() }));
vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest: vi.fn(),
  getEngineVersionForChatByIdForRequest: vi.fn(),
  getLatestEngineVersionForChatForRequest: vi.fn(),
}));

import {
  OPENCLAW_DISPATCH_HEADER,
  OPENCLAW_DISPATCH_NOT_STARTED,
  OPENCLAW_DISPATCH_STARTED,
} from "@/lib/openclaw/gateway-response";
import { POST } from "./route";

function request(body = JSON.stringify({ messages: [{ role: "user", content: "hej" }] })) {
  return new NextRequest("http://localhost/api/openclaw/chat", { method: "POST", body });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.surfaceStatus.surfaceEnabled = true;
  mocks.withRateLimit.mockImplementation(
    async (_req: Request, _key: string, callback: () => Promise<Response>) => callback(),
  );
  mocks.gateway.mockResolvedValue({
    response: new Response("stream", { status: 200 }),
    route: { lane: "primary" },
  });
  mocks.validateMessages.mockReturnValue({
    ok: true,
    messages: [{ role: "user", content: "hej" }],
  });
});

describe("POST /api/openclaw/chat dispatch receipt", () => {
  it.each([403, 429, 503])(
    "certifierar limiter-svar %s som not-started",
    async (status) => {
      mocks.withRateLimit.mockResolvedValueOnce(new Response("blocked", { status }));

      const response = await POST(request());

      expect(response.status).toBe(status);
      expect(response.headers.get(OPENCLAW_DISPATCH_HEADER)).toBe(
        OPENCLAW_DISPATCH_NOT_STARTED,
      );
      expect(mocks.gateway).not.toHaveBeenCalled();
    },
  );

  it("certifierar tidigt disabled-svar som not-started", async () => {
    mocks.surfaceStatus.surfaceEnabled = false;

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get(OPENCLAW_DISPATCH_HEADER)).toBe(
      OPENCLAW_DISPATCH_NOT_STARTED,
    );
    expect(mocks.gateway).not.toHaveBeenCalled();
  });

  it("certifierar invalid JSON som not-started", async () => {
    const response = await POST(request("{"));

    expect(response.status).toBe(400);
    expect(response.headers.get(OPENCLAW_DISPATCH_HEADER)).toBe(
      OPENCLAW_DISPATCH_NOT_STARTED,
    );
    expect(mocks.gateway).not.toHaveBeenCalled();
  });

  it("certifierar ogiltiga meddelanden som not-started", async () => {
    mocks.validateMessages.mockReturnValueOnce({ ok: false, error: "Invalid messages" });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(response.headers.get(OPENCLAW_DISPATCH_HEADER)).toBe(
      OPENCLAW_DISPATCH_NOT_STARTED,
    );
    expect(mocks.gateway).not.toHaveBeenCalled();
  });

  it("markerar gatewayanrop som started även när gatewayen kastar", async () => {
    mocks.gateway.mockRejectedValueOnce(new TypeError("network failed"));

    const response = await POST(request());

    expect(response.status).toBe(502);
    expect(response.headers.get(OPENCLAW_DISPATCH_HEADER)).toBe(OPENCLAW_DISPATCH_STARTED);
    expect(mocks.gateway).toHaveBeenCalledTimes(1);
  });

  it("markerar ett framgångsrikt gatewayanrop som started", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get(OPENCLAW_DISPATCH_HEADER)).toBe(OPENCLAW_DISPATCH_STARTED);
    expect(mocks.gateway).toHaveBeenCalledTimes(1);
  });
});
