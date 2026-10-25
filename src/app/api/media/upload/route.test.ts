import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const canUserUploadFile = vi.hoisted(() => vi.fn());
const saveMediaLibraryItem = vi.hoisted(() => vi.fn());
const getMediaLibraryByUser = vi.hoisted(() => vi.fn());
const getMediaLibraryCounts = vi.hoisted(() => vi.fn());
const uploadBlob = vi.hoisted(() => vi.fn());
const deleteBlob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/media", () => ({
  canUserUploadFile,
  getMediaLibraryByUser,
  getMediaLibraryCounts,
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

function uploadRequest(): NextRequest {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "hero.png", { type: "image/png" }));
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
  canUserUploadFile.mockResolvedValue({ allowed: true });
  uploadBlob.mockResolvedValue({
    url: "https://blob.example/hero.png",
    path: "user_1/media/hero.png",
    storageType: "blob",
  });
  deleteBlob.mockResolvedValue(true);
  getMediaLibraryByUser.mockResolvedValue([]);
  getMediaLibraryCounts.mockResolvedValue({ images: 0, videos: 0, other: 0 });
});

describe("POST /api/media/upload", () => {
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

  it("preserves the blob when the metadata write outcome is unknown", async () => {
    saveMediaLibraryItem.mockRejectedValue(new Error("connection closed after commit"));

    const response = await POST(uploadRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: "Kunde inte spara filen" });
    expect(deleteBlob).not.toHaveBeenCalled();
  });
});

describe("GET /api/media/upload", () => {
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
