import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getSessionIdFromRequest = vi.hoisted(() => vi.fn());
const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());
const setProjectThumbnail = vi.hoisted(() => vi.fn());
const deleteCache = vi.hoisted(() => vi.fn());
const isDisallowedHost = vi.hoisted(() => vi.fn());
const hostResolvesToPrivate = vi.hoisted(() => vi.fn());
const withRateLimit = vi.hoisted(() => vi.fn());
const uploadBlob = vi.hoisted(() => vi.fn());
const deleteBlob = vi.hoisted(() => vi.fn());
const captureThumbnailScreenshot = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/auth/session", () => ({ getSessionIdFromRequest }));
vi.mock("@/lib/db/services/projects", () => ({
  getProjectByIdForOwner,
  getProjectData,
  setProjectThumbnail,
}));
vi.mock("@/lib/data/redis", () => ({ deleteCache }));
vi.mock("@/lib/ssrf-guard", () => ({ isDisallowedHost, hostResolvesToPrivate }));
vi.mock("@/lib/rateLimit", () => ({ withRateLimit }));
vi.mock("@/lib/vercel/blob-service", () => ({ uploadBlob, deleteBlob }));
vi.mock("@/lib/projects/thumbnail-capture", () => ({ captureThumbnailScreenshot }));

const { POST } = await import("./route");

const ORIGINAL_PREVIEW_HOST_BASE_URL = process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL;
const ORIGINAL_TIER2_SUFFIXES = process.env.NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES;
const ALLOWED_PREVIEW_URL = "https://preview-host.example.com/chat-1";

function thumbnailRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/projects/proj_1/thumbnail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const routeParams = { params: Promise.resolve({ id: "proj_1" }) };

describe("POST /api/projects/[id]/thumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://preview-host.example.com";
    delete process.env.NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES;
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getSessionIdFromRequest.mockReturnValue("sess_1");
    getProjectByIdForOwner.mockResolvedValue({ id: "proj_1", thumbnail_path: null });
    getProjectData.mockResolvedValue(null);
    setProjectThumbnail.mockResolvedValue({ previousThumbnailPath: null });
    deleteCache.mockResolvedValue(undefined);
    isDisallowedHost.mockReturnValue(false);
    hostResolvesToPrivate.mockResolvedValue(false);
    withRateLimit.mockImplementation(
      (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
    );
    uploadBlob.mockResolvedValue({ url: "https://blob.example/thumb.jpg", path: "p", storageType: "blob" });
    deleteBlob.mockResolvedValue(true);
    captureThumbnailScreenshot.mockResolvedValue(Buffer.from("jpeg"));
  });

  afterAll(() => {
    if (ORIGINAL_PREVIEW_HOST_BASE_URL === undefined) {
      delete process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL;
    } else {
      process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = ORIGINAL_PREVIEW_HOST_BASE_URL;
    }
    if (ORIGINAL_TIER2_SUFFIXES === undefined) {
      delete process.env.NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES;
    } else {
      process.env.NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES = ORIGINAL_TIER2_SUFFIXES;
    }
  });

  it("captures, uploads and persists thumbnail_path (happy path)", async () => {
    const res = await POST(
      thumbnailRequest({ previewUrl: ALLOWED_PREVIEW_URL }),
      routeParams,
    );
    expect(res.status).toBe(200);
    expect(captureThumbnailScreenshot).toHaveBeenCalledWith(ALLOWED_PREVIEW_URL);
    expect(uploadBlob).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj_1", contentType: "image/jpeg", userId: "user_1" }),
    );
    expect(setProjectThumbnail).toHaveBeenCalledWith(
      "proj_1",
      "https://blob.example/thumb.jpg",
      { userId: "user_1", sessionId: "sess_1" },
    );
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  // Codex/VADE P1 (PR #426): the raw session cookie value is an ownership
  // credential — it must never appear in a PUBLIC blob URL.
  it("never embeds the raw session id in the blob path for guests", async () => {
    getCurrentUser.mockResolvedValue(null);
    getSessionIdFromRequest.mockReturnValue("super-secret-session-token");
    const res = await POST(
      thumbnailRequest({ previewUrl: ALLOWED_PREVIEW_URL }),
      routeParams,
    );
    expect(res.status).toBe(200);
    const ownerArg = uploadBlob.mock.calls[0]![0].userId as string;
    expect(ownerArg).not.toContain("super-secret-session-token");
    expect(ownerArg).toMatch(/^sess-[0-9a-f]{12}$/);
  });

  // Codex/VADE P2 (PR #426): Vercel Blob rejects pathname overwrites — each
  // capture uploads a unique name and the superseded blob is cleaned up.
  it("uploads a unique filename and deletes the superseded blob", async () => {
    setProjectThumbnail.mockResolvedValue({
      previousThumbnailPath: "https://blob.example/old-thumb.jpg",
    });
    const res = await POST(
      thumbnailRequest({ previewUrl: ALLOWED_PREVIEW_URL }),
      routeParams,
    );
    expect(res.status).toBe(200);
    const filename = uploadBlob.mock.calls[0]![0].filename as string;
    expect(filename).toMatch(/^thumbnail-\d+\.jpg$/);
    expect(deleteBlob).toHaveBeenCalledWith("https://blob.example/old-thumb.jpg");
  });

  it("returns 401 without any identity", async () => {
    getCurrentUser.mockResolvedValue(null);
    getSessionIdFromRequest.mockReturnValue(null);
    const res = await POST(thumbnailRequest({ previewUrl: "https://x.dev/" }), routeParams);
    expect(res.status).toBe(401);
    expect(captureThumbnailScreenshot).not.toHaveBeenCalled();
  });

  it("returns 404 for a project the caller does not own (tenant guard)", async () => {
    getProjectByIdForOwner.mockResolvedValue(null);
    const res = await POST(thumbnailRequest({ previewUrl: "https://x.dev/" }), routeParams);
    expect(res.status).toBe(404);
    expect(captureThumbnailScreenshot).not.toHaveBeenCalled();
  });

  it("blocks private/disallowed hosts (SSRF guard)", async () => {
    hostResolvesToPrivate.mockResolvedValue(true);
    const res = await POST(
      thumbnailRequest({ previewUrl: ALLOWED_PREVIEW_URL }),
      routeParams,
    );
    expect(res.status).toBe(403);
    expect(captureThumbnailScreenshot).not.toHaveBeenCalled();
  });

  it("rejects preview URLs outside the server-side allowlist", async () => {
    const res = await POST(
      thumbnailRequest({ previewUrl: "https://example.com/not-preview-host" }),
      routeParams,
    );
    expect(res.status).toBe(403);
    expect(captureThumbnailScreenshot).not.toHaveBeenCalled();
  });

  // Codex P1 (PR #435): the documented suffix config value "fly.dev" must NOT
  // open the capture endpoint for arbitrary attacker-controlled *.fly.dev apps.
  it("rejects attacker-controlled hosts even when the suffix config lists fly.dev", async () => {
    process.env.NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES = "fly.dev";
    const res = await POST(
      thumbnailRequest({ previewUrl: "https://attacker-app.fly.dev/" }),
      routeParams,
    );
    expect(res.status).toBe(403);
    expect(captureThumbnailScreenshot).not.toHaveBeenCalled();
  });

  it("allows an exact extra hostname from the configured list", async () => {
    process.env.NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES =
      "alt-preview.example.net, .other-host.example.org";
    const res = await POST(
      thumbnailRequest({ previewUrl: "https://alt-preview.example.net/chat-9" }),
      routeParams,
    );
    expect(res.status).toBe(200);
    expect(captureThumbnailScreenshot).toHaveBeenCalledWith(
      "https://alt-preview.example.net/chat-9",
    );
  });

  it("does not treat exact extra hostnames as suffixes", async () => {
    process.env.NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES = "alt-preview.example.net";
    const res = await POST(
      thumbnailRequest({ previewUrl: "https://evil.alt-preview.example.net/" }),
      routeParams,
    );
    expect(res.status).toBe(403);
    expect(captureThumbnailScreenshot).not.toHaveBeenCalled();
  });

  it("rejects IPv4-mapped IPv6 literals (SSRF bypass guard)", async () => {
    const res = await POST(
      thumbnailRequest({ previewUrl: "http://[::ffff:7f00:1]/" }),
      routeParams,
    );
    expect(res.status).toBe(403);
    expect(captureThumbnailScreenshot).not.toHaveBeenCalled();
  });

  it("falls back to stored demo_url when body has no previewUrl", async () => {
    getProjectData.mockResolvedValue({ demo_url: "https://preview-host.example.com/stored-chat" });
    const res = await POST(thumbnailRequest({}), routeParams);
    expect(res.status).toBe(200);
    expect(captureThumbnailScreenshot).toHaveBeenCalledWith(
      "https://preview-host.example.com/stored-chat",
    );
  });

  it("returns 409 when no preview URL exists at all", async () => {
    const res = await POST(thumbnailRequest({}), routeParams);
    expect(res.status).toBe(409);
    expect(captureThumbnailScreenshot).not.toHaveBeenCalled();
  });

  it("returns 502 when the screenshot fails, without persisting", async () => {
    captureThumbnailScreenshot.mockRejectedValue(new Error("nav timeout"));
    const res = await POST(
      thumbnailRequest({ previewUrl: ALLOWED_PREVIEW_URL }),
      routeParams,
    );
    expect(res.status).toBe(502);
    expect(setProjectThumbnail).not.toHaveBeenCalled();
  });

  it("returns 500 and deletes uploaded blob when DB persist returns null", async () => {
    setProjectThumbnail.mockResolvedValue(null);
    const res = await POST(
      thumbnailRequest({ previewUrl: ALLOWED_PREVIEW_URL }),
      routeParams,
    );
    expect(res.status).toBe(500);
    expect(deleteBlob).toHaveBeenCalledWith("https://blob.example/thumb.jpg");
  });

  it("keys thumbnail rate-limit by authenticated user id", async () => {
    const res = await POST(
      thumbnailRequest({ previewUrl: ALLOWED_PREVIEW_URL }),
      routeParams,
    );
    expect(res.status).toBe(200);
    expect(withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "projects:thumbnail",
      expect.any(Function),
      { userId: "user_1" },
    );
  });

  // Codex P2 (PR #435): the guest session id is client-controlled — rotating
  // it must not mint fresh buckets. Guests fall back to IP keying.
  it("does not key guest rate-limit on the client-controlled session id", async () => {
    getCurrentUser.mockResolvedValue(null);
    getSessionIdFromRequest.mockReturnValue("rotatable-session-token");
    const res = await POST(
      thumbnailRequest({ previewUrl: ALLOWED_PREVIEW_URL }),
      routeParams,
    );
    expect(res.status).toBe(200);
    const optionsArg = withRateLimit.mock.calls[0]?.[3];
    expect(optionsArg).toBeUndefined();
  });

  it("rejects non-http(s) URLs", async () => {
    const res = await POST(thumbnailRequest({ previewUrl: "ftp://x.dev/" }), routeParams);
    expect(res.status).toBe(400);
  });
});
