import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getSessionIdFromRequest = vi.hoisted(() => vi.fn());
const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());
const updateProject = vi.hoisted(() => vi.fn());
const deleteCache = vi.hoisted(() => vi.fn());
const isDisallowedHost = vi.hoisted(() => vi.fn());
const hostResolvesToPrivate = vi.hoisted(() => vi.fn());
const uploadBlob = vi.hoisted(() => vi.fn());
const captureThumbnailScreenshot = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/auth/session", () => ({ getSessionIdFromRequest }));
vi.mock("@/lib/db/services/projects", () => ({
  getProjectByIdForOwner,
  getProjectData,
  updateProject,
}));
vi.mock("@/lib/data/redis", () => ({ deleteCache }));
vi.mock("@/lib/ssrf-guard", () => ({ isDisallowedHost, hostResolvesToPrivate }));
vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/vercel/blob-service", () => ({ uploadBlob }));
vi.mock("@/lib/projects/thumbnail-capture", () => ({ captureThumbnailScreenshot }));

const { POST } = await import("./route");

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
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getSessionIdFromRequest.mockReturnValue("sess_1");
    getProjectByIdForOwner.mockResolvedValue({ id: "proj_1", thumbnail_path: null });
    getProjectData.mockResolvedValue(null);
    updateProject.mockResolvedValue({ id: "proj_1" });
    deleteCache.mockResolvedValue(undefined);
    isDisallowedHost.mockReturnValue(false);
    hostResolvesToPrivate.mockResolvedValue(false);
    uploadBlob.mockResolvedValue({ url: "https://blob.example/thumb.jpg", path: "p", storageType: "blob" });
    captureThumbnailScreenshot.mockResolvedValue(Buffer.from("jpeg"));
  });

  it("captures, uploads and persists thumbnail_path (happy path)", async () => {
    const res = await POST(
      thumbnailRequest({ previewUrl: "https://site.fly.dev/" }),
      routeParams,
    );
    expect(res.status).toBe(200);
    expect(captureThumbnailScreenshot).toHaveBeenCalledWith("https://site.fly.dev/");
    expect(uploadBlob).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj_1", contentType: "image/jpeg" }),
    );
    expect(updateProject).toHaveBeenCalledWith(
      "proj_1",
      { thumbnail_path: "https://blob.example/thumb.jpg" },
      { userId: "user_1", sessionId: "sess_1" },
    );
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
      thumbnailRequest({ previewUrl: "https://internal.local/" }),
      routeParams,
    );
    expect(res.status).toBe(403);
    expect(captureThumbnailScreenshot).not.toHaveBeenCalled();
  });

  it("falls back to stored demo_url when body has no previewUrl", async () => {
    getProjectData.mockResolvedValue({ demo_url: "https://stored.fly.dev/" });
    const res = await POST(thumbnailRequest({}), routeParams);
    expect(res.status).toBe(200);
    expect(captureThumbnailScreenshot).toHaveBeenCalledWith("https://stored.fly.dev/");
  });

  it("returns 409 when no preview URL exists at all", async () => {
    const res = await POST(thumbnailRequest({}), routeParams);
    expect(res.status).toBe(409);
    expect(captureThumbnailScreenshot).not.toHaveBeenCalled();
  });

  it("returns 502 when the screenshot fails, without persisting", async () => {
    captureThumbnailScreenshot.mockRejectedValue(new Error("nav timeout"));
    const res = await POST(
      thumbnailRequest({ previewUrl: "https://site.fly.dev/" }),
      routeParams,
    );
    expect(res.status).toBe(502);
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("rejects non-http(s) URLs", async () => {
    const res = await POST(thumbnailRequest({ previewUrl: "ftp://x.dev/" }), routeParams);
    expect(res.status).toBe(400);
  });
});
