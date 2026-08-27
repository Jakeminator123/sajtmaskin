import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const launchCaptureBrowser = vi.hoisted(() => vi.fn());
const getPreviewHostBaseUrl = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/builder/inspector-feature", () => ({
  isBuilderInspectorEnabled: () => true,
  getBuilderInspectorDisabledMessage: () => "Inspektorn är av.",
}));

vi.mock("@/lib/gen/preview/tier2-config", () => ({ getPreviewHostBaseUrl }));
vi.mock("@/lib/gen/preview/session-store", () => ({ getActivePreviewSessionAsync }));

vi.mock("@/lib/ssrf-guard", () => ({
  isDisallowedHost: () => false,
  hostResolvesToPrivate: async () => false,
}));

// Startpunkten mockas för att bevisa det viktigaste: en avvisad URL får aldrig
// hinna starta en Chromium.
vi.mock("@/lib/capture/browser", () => ({
  launchCaptureBrowser,
  applyCaptureRequestGate: vi.fn(),
  assertFinalUrlAllowed: vi.fn(),
}));

const { POST } = await import("./route");

const currentIdentity = {
  chatId: "chat_1",
  versionId: "v1",
  previewSessionId: "ps_1",
  lifecycleToken: "life_1",
};

function captureRequest(
  url: string,
  identity: {
    chatId: string;
    versionId: string;
    previewSessionId: string;
    lifecycleToken: string | null;
  } | null = currentIdentity,
): Request {
  return new Request("http://localhost/api/inspector-capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      xPercent: 50,
      yPercent: 50,
      viewportWidth: 1280,
      viewportHeight: 800,
      ...(identity ?? {}),
    }),
  });
}

describe("POST /api/inspector-capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(null);
    getPreviewHostBaseUrl.mockReturnValue("https://preview.example/p");
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_1",
      lifecycleToken: "life_1",
      versionId: "v1",
      previewUrl: "https://preview.example/p/abc",
    });
    launchCaptureBrowser.mockRejectedValue(new Error("browsern skulle aldrig ha startats"));
  });

  it("kräver inloggning innan något capture-arbete sker", async () => {
    const res = await POST(new Request("http://localhost/api/inspector-capture", { method: "POST" }));

    expect(res.status).toBe(401);
    expect(launchCaptureBrowser).not.toHaveBeenCalled();
  });

  it("avvisar en gäst utan konto, även med en giltig session", async () => {
    // Gästen släpptes tidigare in hit och fick en bild som `/api/media/upload`
    // sedan 401:ade — bilden syntes lokalt men nådde aldrig modellen.
    const req = captureRequest("https://preview.example/p/abc");
    req.headers.set("x-session-id", "gäst-session");

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(launchCaptureBrowser).not.toHaveBeenCalled();
  });

  it("avvisar en URL utanför preview-allowlisten utan att starta browsern", async () => {
    // Utan allowlisten är routen en publik screenshot-proxy: SSRF-kontrollen
    // godkänner varje PUBLIK värd.
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_1",
      lifecycleToken: "life_1",
      versionId: "v1",
      previewUrl: "https://angripare.example/hemligt",
    });

    const res = await POST(captureRequest("https://angripare.example/hemligt"));

    expect(res.status).toBe(403);
    expect(launchCaptureBrowser).not.toHaveBeenCalled();
  });

  it("avvisar capture utan serverbunden preview-identitet", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" });

    const res = await POST(captureRequest("https://preview.example/p/abc", null));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(expect.objectContaining({ staleIdentity: true }));
    expect(launchCaptureBrowser).not.toHaveBeenCalled();
  });

  it("fail-closed när preview-host-basen inte är konfigurerad", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    getPreviewHostBaseUrl.mockReturnValue("");

    const res = await POST(captureRequest("https://preview.example/p/abc"));

    expect(res.status).toBe(503);
    expect(launchCaptureBrowser).not.toHaveBeenCalled();
  });

  it("avvisar en stale preview-identitet innan Chromium startas", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_new",
      lifecycleToken: "life_new",
      versionId: "v_new",
      previewUrl: "https://preview.example/p/abc",
    });

    const res = await POST(
      captureRequest("https://preview.example/p/abc", {
        chatId: "chat_1",
        versionId: "v_old",
        previewSessionId: "ps_old",
        lifecycleToken: "life_old",
      }),
    );

    expect(res.status).toBe(409);
    expect(launchCaptureBrowser).not.toHaveBeenCalled();
  });

  it("släpper igenom preview-URL:en till startpunkten för en inloggad användare", async () => {
    // Den positiva vägen måste finnas med: annars kunde allowlisten vara låst
    // för hårt och alla fyra testerna ovan hade fortfarande varit gröna.
    getCurrentUser.mockResolvedValue({ id: "user-1" });

    const res = await POST(captureRequest("https://preview.example/p/abc"));

    expect(launchCaptureBrowser).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
  });
});
