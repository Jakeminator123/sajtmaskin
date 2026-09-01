import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getSessionIdFromRequest = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
const applyCaptureRequestGate = vi.hoisted(() => vi.fn());
const launchBrowser = vi.hoisted(() => vi.fn());
const pageGoto = vi.hoisted(() => vi.fn());
const pageUrl = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionIdFromRequest,
}));

vi.mock("@/lib/gen/preview/session-store", () => ({ getActivePreviewSessionAsync }));

vi.mock("@/lib/capture/browser", () => ({
  applyCaptureRequestGate,
  launchCaptureBrowser: launchBrowser,
}));

vi.mock("@/lib/builder/inspector-feature", () => ({
  isBuilderInspectorEnabled: () => true,
  getBuilderInspectorDisabledMessage: () => "Inspektorn är av.",
}));

vi.mock("@/lib/ssrf-guard", () => ({
  isLoopbackHost: () => false,
  isDisallowedHost: () => false,
  hostResolvesToPrivate: async () => false,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

const { POST } = await import("./route");

describe("POST /api/inspector-element-map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    getCurrentUser.mockResolvedValue(null);
    getSessionIdFromRequest.mockReturnValue(null);
    pageGoto.mockResolvedValue(null);
    pageUrl.mockReturnValue("https://vm.fly.dev/chat_1");
    launchBrowser.mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto: pageGoto,
        url: pageUrl,
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue([]),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("requires a user or existing guest session before element mapping", async () => {
    const res = await POST(new Request("http://localhost/api/inspector-element-map", { method: "POST" }));

    expect(res.status).toBe(401);
  });

  it("rejects a stale supplied preview tuple before cache or browser work", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_new",
      lifecycleToken: "life_new",
      versionId: "v_new",
      previewUrl: "https://vm.fly.dev/chat_1",
    });

    const res = await POST(
      new Request("http://localhost/api/inspector-element-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://vm.fly.dev/chat_1?case=gate",
          viewportWidth: 1280,
          viewportHeight: 800,
          chatId: "chat_1",
          versionId: "v_old",
          previewSessionId: "ps_old",
          lifecycleToken: "life_old",
        }),
      }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(expect.objectContaining({ staleIdentity: true }));
    expect(launchBrowser).not.toHaveBeenCalled();
  });

  it("rejects a tuple-less public URL before browser work", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });

    const res = await POST(
      new Request("http://localhost/api/inspector-element-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://vm.fly.dev/chat_1" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(expect.objectContaining({ staleIdentity: true }));
    expect(launchBrowser).not.toHaveBeenCalled();
  });

  it("returns the honest serverless 503 for a tuple-less request, not staleIdentity", async () => {
    vi.stubEnv("VERCEL", "1");
    getCurrentUser.mockResolvedValue({ id: "user_1" });

    const res = await POST(
      new Request("http://localhost/api/inspector-element-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://vm-fly-jakem.fly.dev/57027ae6-19df-48cb-aa47-9c42a626db50",
          viewportWidth: 1280,
          viewportHeight: 800,
          maxElements: 300,
        }),
      }),
    );

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/serverless/i),
      }),
    );
    expect(body).not.toEqual(expect.objectContaining({ staleIdentity: true }));
    expect(launchBrowser).not.toHaveBeenCalled();
  });

  it("still requires auth before the serverless 503", async () => {
    vi.stubEnv("VERCEL", "1");

    const res = await POST(
      new Request("http://localhost/api/inspector-element-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://vm.fly.dev/chat_1" }),
      }),
    );

    expect(res.status).toBe(401);
    expect(launchBrowser).not.toHaveBeenCalled();
  });

  it("gates Tier-2 Chromium requests and revalidates the captured URL", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_1",
      lifecycleToken: "life_1",
      versionId: "v1",
      previewUrl: "https://vm.fly.dev/chat_1",
    });

    const res = await POST(
      new Request("http://localhost/api/inspector-element-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://vm.fly.dev/chat_1?case=redirect",
          chatId: "chat_1",
          versionId: "v1",
          previewSessionId: "ps_1",
          lifecycleToken: "life_1",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(applyCaptureRequestGate).toHaveBeenCalledTimes(1);
    expect(applyCaptureRequestGate.mock.invocationCallOrder[0]).toBeLessThan(
      pageGoto.mock.invocationCallOrder[0]!,
    );
    expect(pageUrl).toHaveBeenCalled();
  });

  it("rejects a redirect away from the attested preview before caching", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_1",
      lifecycleToken: "life_1",
      versionId: "v1",
      previewUrl: "https://vm.fly.dev/chat_1",
    });
    pageUrl.mockReturnValue("https://attacker.example/");

    const res = await POST(
      new Request("http://localhost/api/inspector-element-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://vm.fly.dev/chat_1",
          chatId: "chat_1",
          versionId: "v1",
          previewSessionId: "ps_1",
          lifecycleToken: "life_1",
        }),
      }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(expect.objectContaining({ staleIdentity: true }));
  });
});
