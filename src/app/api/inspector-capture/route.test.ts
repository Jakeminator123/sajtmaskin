import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const launchCaptureBrowser = vi.hoisted(() => vi.fn());
const getPreviewHostBaseUrl = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/builder/inspector-feature", () => ({
  isBuilderInspectorEnabled: () => true,
  getBuilderInspectorDisabledMessage: () => "Inspektorn är av.",
}));

vi.mock("@/lib/gen/preview/tier2-config", () => ({ getPreviewHostBaseUrl }));

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

function captureRequest(url: string): Request {
  return new Request("http://localhost/api/inspector-capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      xPercent: 50,
      yPercent: 50,
      viewportWidth: 1280,
      viewportHeight: 800,
    }),
  });
}

describe("POST /api/inspector-capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(null);
    getPreviewHostBaseUrl.mockReturnValue("https://preview.example/p");
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

    const res = await POST(captureRequest("https://angripare.example/hemligt"));

    expect(res.status).toBe(403);
    expect(launchCaptureBrowser).not.toHaveBeenCalled();
  });

  it("fail-closed när preview-host-basen inte är konfigurerad", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    getPreviewHostBaseUrl.mockReturnValue("");

    const res = await POST(captureRequest("https://preview.example/p/abc"));

    expect(res.status).toBe(503);
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
