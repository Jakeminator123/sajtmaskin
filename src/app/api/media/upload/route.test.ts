// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MediaUploadPolicyError } from "@/lib/media/upload-policy-error";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getSessionIdFromRequest = vi.hoisted(() => vi.fn());
const getChatProjectId = vi.hoisted(() => vi.fn());
const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const canUserUploadFile = vi.hoisted(() => vi.fn());
const saveMediaLibraryItem = vi.hoisted(() => vi.fn());
const getMediaLibraryByUser = vi.hoisted(() => vi.fn());
const getMediaLibraryCounts = vi.hoisted(() => vi.fn());
const requireMediaUploadProject = vi.hoisted(() => vi.fn());
const uploadBlob = vi.hoisted(() => vi.fn());
const deleteBlob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/auth/session", () => ({ getSessionIdFromRequest }));
vi.mock("@/lib/db/chat-repository/chats", () => ({ getChatProjectId }));
vi.mock("@/lib/db/services/projects", () => ({ getProjectByIdForOwner }));
vi.mock("@/lib/db/services/media", () => ({
  canUserUploadFile,
  getMediaLibraryByUser,
  getMediaLibraryCounts,
  requireMediaUploadProject,
  saveMediaLibraryItem,
}));
vi.mock("@/lib/vercel/blob-service", () => ({
  generateUniqueFilename: (name: string) => `safe-${name}`,
  uploadBlob,
  deleteBlob,
}));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/utils/debug", () => ({ errorLog: vi.fn(), warnLog: vi.fn() }));

const { GET, POST } = await import("./route");

function uploadRequest(metadata: Record<string, string> = {}): NextRequest {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "hero.png", { type: "image/png" }));
  for (const [name, value] of Object.entries(metadata)) form.append(name, value);
  return new NextRequest("http://localhost/api/media/upload", { method: "POST", body: form });
}

function uploadRequestWithMetadata(name: string, value: string | File): NextRequest {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "hero.png", { type: "image/png" }));
  form.append(name, value);
  return new NextRequest("http://localhost/api/media/upload", { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user_1" });
  getProjectByIdForOwner.mockResolvedValue({ id: "owned-site", user_id: "user_1" });
  getChatProjectId.mockResolvedValue(null);
  getSessionIdFromRequest.mockReturnValue(null);
  canUserUploadFile.mockResolvedValue({ allowed: true });
  requireMediaUploadProject.mockResolvedValue(undefined);
  uploadBlob.mockResolvedValue({
    url: "https://blob.example/hero.png",
    path: "user_1/media/hero.png",
    storageType: "blob",
  });
  deleteBlob.mockResolvedValue(true);
  saveMediaLibraryItem.mockResolvedValue({ id: "media_1", file_type: "image" });
  getMediaLibraryByUser.mockResolvedValue([]);
  getMediaLibraryCounts.mockResolvedValue({ images: 0, videos: 0, other: 0 });
});

describe("POST /api/media/upload", () => {
  it("saves builder attachments to the verified project and rejects a foreign project before creating a blob", async () => {
    const response = await POST(uploadRequestWithMetadata("projectId", "owned"));
    expect(response.status).toBe(200);
    expect(canUserUploadFile).toHaveBeenCalledWith("user_1", "image/png", "owned");
    expect(uploadBlob).toHaveBeenCalledWith(expect.objectContaining({ userId: "user_1", projectId: "owned", category: "media" }));
    expect(saveMediaLibraryItem.mock.calls[0]?.[7]).toBe("owned");

    uploadBlob.mockClear();
    canUserUploadFile.mockRejectedValueOnce(new MediaUploadPolicyError("Sajten hittades inte.", 404));
    expect((await POST(uploadRequestWithMetadata("projectId", "foreign"))).status).toBe(404);
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  it("stores the opted-in multipart asset in the project library category", async () => {
    const form = new FormData();
    form.append("file", new File(["png"], "bild.png", { type: "image/png" }));
    form.append("projectId", "owned");
    form.append("mediaScope", "media-library");
    const response = await POST(new NextRequest("http://localhost/api/media/upload", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    expect(uploadBlob).toHaveBeenCalledWith(expect.objectContaining({ projectId: "owned", category: "media-library" }));
  });

  it("uses the owned chat's site quota and project export category", async () => {
    getChatProjectId.mockResolvedValue("owned-site");
    const request = uploadRequest({ chatId: "owned-chat", mediaScope: "media-library" });
    expect((await POST(request)).status).toBe(200);
    expect(getChatProjectId).toHaveBeenCalledExactlyOnceWith("owned-chat");
    expect(getCurrentUser).toHaveBeenCalledExactlyOnceWith(request);
    expect(getProjectByIdForOwner).toHaveBeenCalledExactlyOnceWith("owned-site", {
      userId: "user_1", sessionId: null,
    });
    expect(canUserUploadFile).toHaveBeenCalledWith("user_1", "image/png", "owned-site");
    expect(uploadBlob).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1", projectId: "owned-site", category: "media-library",
    }));
    expect(saveMediaLibraryItem.mock.calls[0]?.[7]).toBe("owned-site");
  });

  it("keeps uploads without a site or chat in the personal library", async () => {
    expect((await POST(uploadRequest())).status).toBe(200);
    expect(getChatProjectId).not.toHaveBeenCalled();
    expect(canUserUploadFile).toHaveBeenCalledWith("user_1", "image/png", undefined);
    expect(uploadBlob).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1", projectId: undefined, category: "media",
    }));
    expect(saveMediaLibraryItem.mock.calls[0]?.[7]).toBeUndefined();
  });

  it("rejects an unavailable chat and a chat with a mismatched site before upload", async () => {
    expect((await POST(uploadRequest({ chatId: "foreign-chat" }))).status).toBe(404);
    getChatProjectId.mockResolvedValue("owned-site");
    getProjectByIdForOwner.mockResolvedValueOnce(null);
    expect((await POST(uploadRequest({ chatId: "unowned-chat" }))).status).toBe(404);
    const forged = uploadRequest({ chatId: "owned-chat", projectId: "other-owned-site" });
    expect((await POST(forged)).status).toBe(404);
    expect(canUserUploadFile).not.toHaveBeenCalled();
    expect(uploadBlob).not.toHaveBeenCalled();
    expect(saveMediaLibraryItem).not.toHaveBeenCalled();
  });

  it("passes the authenticated user and existing session hint to the owner rule", async () => {
    getChatProjectId.mockResolvedValue("owned-site");
    getSessionIdFromRequest.mockReturnValue("existing-session");
    expect((await POST(uploadRequest({ chatId: "owned-chat" }))).status).toBe(200);
    expect(getProjectByIdForOwner).toHaveBeenCalledExactlyOnceWith("owned-site", {
      userId: "user_1", sessionId: "existing-session",
    });
  });

  it("does not look up a chat or project for an unauthenticated upload", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    expect((await POST(uploadRequest({ chatId: "owned-chat" }))).status).toBe(401);
    expect(getChatProjectId).not.toHaveBeenCalled();
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
  });

  it("rejects a non-text chat id before lookup or upload", async () => {
    const request = uploadRequestWithMetadata("chatId", new File(["owned-chat"], "chat.txt"));
    expect((await POST(request)).status).toBe(400);
    expect(getChatProjectId).not.toHaveBeenCalled();
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  it("returns the atomic quota rejection and cleans up only the new unrecorded blob", async () => {
    const reason = "Sajten har nått gränsen på 200 bilder och logotyper.";
    saveMediaLibraryItem.mockRejectedValueOnce(new MediaUploadPolicyError(reason, 400));
    const response = await POST(uploadRequestWithMetadata("projectId", "owned"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: reason });
    expect(deleteBlob).toHaveBeenCalledExactlyOnceWith("https://blob.example/hero.png");
  });

  it("rejects non-text metadata before uploading", async () => {
    const response = await POST(
      uploadRequestWithMetadata(
        "description",
        new File(["secret"], "metadata.txt", { type: "text/plain" }),
      ),
    );

    expect(response.status).toBe(400);
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared upload before parsing multipart data", async () => {
    const request = uploadRequest();
    request.headers.set("content-length", String(5 * 1024 * 1024 + 1));

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  it.each([null, "1"])("limits actual multipart bytes with Content-Length %s", async (declaredLength) => {
    const request = uploadRequestWithMetadata("ignored-padding", "x".repeat(5 * 1024 * 1024));
    if (declaredLength !== null) request.headers.set("content-length", declaredLength);

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(uploadBlob).not.toHaveBeenCalled();
    expect(saveMediaLibraryItem).not.toHaveBeenCalled();
  });

  it("preserves the blob when the metadata write outcome is unknown", async () => {
    saveMediaLibraryItem.mockRejectedValue(new Error("connection closed after commit"));

    const response = await POST(uploadRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: "Kunde inte spara filen" });
    expect(deleteBlob).not.toHaveBeenCalled();
  });
});

describe("GET /api/media/upload", () => {
  it("uses the selected project's quota while listing the owner's assets from other sites and the personal library", async () => {
    getMediaLibraryByUser.mockResolvedValue([
      { id: 1, project_id: "other-owned", original_name: "other.png" },
      { id: 2, project_id: null, original_name: "legacy.png" },
    ]);
    getMediaLibraryCounts.mockResolvedValue({ images: 200, videos: 3, other: 0 });
    const response = await GET(new NextRequest("http://localhost/api/media/upload?projectId=owned&fileType=image"));
    expect(await response.json()).toMatchObject({
      items: [{ projectId: "other-owned" }, { projectId: null }],
      counts: { images: 200, videos: 3 },
      limits: { maxImages: 200, maxVideos: 3 },
    });
    expect(requireMediaUploadProject).toHaveBeenCalledWith("user_1", "owned");
    expect(getMediaLibraryByUser).toHaveBeenCalledWith("user_1", "image");
    expect(getMediaLibraryCounts).toHaveBeenCalledWith("user_1", "owned");
  });

  it("does not serve counts or images for an unowned project context", async () => {
    requireMediaUploadProject.mockRejectedValueOnce(new MediaUploadPolicyError("Sajten hittades inte.", 404));
    const response = await GET(new NextRequest("http://localhost/api/media/upload?projectId=foreign"));
    expect(response.status).toBe(404);
    expect(getMediaLibraryByUser).not.toHaveBeenCalled();
    expect(getMediaLibraryCounts).not.toHaveBeenCalled();
  });

  it("counts a chat's own site without changing account-wide listing", async () => {
    getChatProjectId.mockResolvedValue("owned-site");
    const request = new NextRequest("http://localhost/api/media/upload?chatId=owned-chat");
    expect((await GET(request)).status).toBe(200);
    expect(getChatProjectId).toHaveBeenCalledExactlyOnceWith("owned-chat");
    expect(getCurrentUser).toHaveBeenCalledExactlyOnceWith(request);
    expect(getProjectByIdForOwner).toHaveBeenCalledExactlyOnceWith("owned-site", {
      userId: "user_1", sessionId: null,
    });
    expect(requireMediaUploadProject).toHaveBeenCalledExactlyOnceWith("user_1", "owned-site");
    expect(getMediaLibraryCounts).toHaveBeenCalledExactlyOnceWith("user_1", "owned-site");
    expect(getMediaLibraryByUser).toHaveBeenCalledExactlyOnceWith("user_1", undefined);
  });

  it("rejects a foreign or mismatched chat without querying the media library", async () => {
    const path = "http://localhost/api/media/upload";
    expect((await GET(new NextRequest(path + "?chatId=foreign"))).status).toBe(404);
    getChatProjectId.mockResolvedValue("owned-site");
    getProjectByIdForOwner.mockResolvedValueOnce(null);
    expect((await GET(new NextRequest(path + "?chatId=unowned-chat"))).status).toBe(404);
    expect((await GET(new NextRequest(path + "?chatId=owned-chat&projectId=other"))).status).toBe(404);
    expect(getMediaLibraryByUser).not.toHaveBeenCalled();
    expect(getMediaLibraryCounts).not.toHaveBeenCalled();
  });

  it("rejects an unknown media type before querying storage", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/media/upload?fileType=not-a-type"),
    );

    expect(response.status).toBe(400);
    expect(getMediaLibraryByUser).not.toHaveBeenCalled();
  });

  it("does not expose media-library failures", async () => {
    getMediaLibraryByUser.mockRejectedValue(new Error("database host secret"));

    const response = await GET(new NextRequest("http://localhost/api/media/upload?fileType=image"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Kunde inte hämta mediebiblioteket",
    });
  });

  it("starts the independent list and count queries in parallel", async () => {
    let releaseList!: () => void;
    let releaseCounts!: () => void;
    getMediaLibraryByUser.mockImplementation(
      () => new Promise<never[]>((resolve) => { releaseList = () => resolve([]); }),
    );
    getMediaLibraryCounts.mockImplementation(
      () => new Promise<{ images: number; videos: number; other: number }>((resolve) => {
        releaseCounts = () => resolve({ images: 0, videos: 0, other: 0 });
      }),
    );

    const pending = GET(new NextRequest("http://localhost/api/media/upload"));
    await vi.waitFor(() => {
      expect(getMediaLibraryByUser).toHaveBeenCalledOnce();
      expect(getMediaLibraryCounts).toHaveBeenCalledOnce();
    });
    releaseList();
    releaseCounts();

    expect((await pending).status).toBe(200);
  });
});
