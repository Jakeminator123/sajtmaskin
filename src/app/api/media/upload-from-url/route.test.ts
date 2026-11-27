import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const safeFetch = vi.hoisted(() => vi.fn());
const uploadBlob = vi.hoisted(() => vi.fn());
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const saveMediaLibraryItem = vi.hoisted(() => vi.fn());
const canUserUploadFile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tenant", () => ({ getEngineChatByIdForRequest }));
vi.mock("@/lib/db/services/media", () => ({ canUserUploadFile, saveMediaLibraryItem }));

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/ssrf-guard", () => ({
  validateSsrfTarget: () => ({ ok: true }),
  safeFetch,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/vercel/blob-service", () => ({
  generateUniqueFilename: (filename: string) => `safe-${filename}`,
  uploadBlob,
}));

const { POST } = await import("./route");

function makeRequest(url: string): NextRequest {
  return new NextRequest("http://localhost/api/media/upload-from-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, filename: "hero.png" }),
  });
}

function makeRawRequest(body: string): NextRequest {
  return new NextRequest("http://localhost/api/media/upload-from-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("POST /api/media/upload-from-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    canUserUploadFile.mockResolvedValue({ allowed: true });
    safeFetch.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "3" },
      }),
    );
    uploadBlob.mockResolvedValue({
      url: "https://blob.example/hero.png",
      path: "user_1/media/hero.png",
      storageType: "blob",
    });
  });

  it("binds a selected source image to the authenticated owner's project and saves its origin", async () => {
    const body = JSON.stringify({
      url: "https://images.example/chair",
      filename: "chair.png",
      chatId: "preview-chat",
      sourcePageUrl: "https://example.com/atelier",
    });
    getEngineChatByIdForRequest.mockResolvedValueOnce(null);
    expect((await POST(makeRawRequest(body))).status).toBe(404);
    expect(safeFetch).not.toHaveBeenCalled();

    getEngineChatByIdForRequest.mockResolvedValueOnce({ project_id: "project-1" });
    saveMediaLibraryItem.mockResolvedValueOnce({ id: 42 });
    const response = await POST(makeRawRequest(body));
    expect(await response.json()).toMatchObject({ success: true, media: { id: 42 } });
    expect(uploadBlob).toHaveBeenCalledWith(expect.objectContaining({ userId: "user_1", projectId: "project-1" }));
    expect(saveMediaLibraryItem.mock.calls[0]?.slice(-2)).toEqual(["project-1", "https://example.com/atelier"]);
  });

  it("shows the existing image quota before a source image is downloaded", async () => {
    const reason = "Max 10 bilder/logos. Ta bort någon först.";
    canUserUploadFile.mockResolvedValueOnce({ allowed: false, reason });
    const response = await POST(makeRawRequest(JSON.stringify({
      url: "https://images.example/chair",
      filename: "chair.png",
      source: "sajtagent-source",
      sourcePageUrl: "https://example.com/atelier",
    })));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: reason });
    expect(canUserUploadFile).toHaveBeenCalledWith("user_1", "image/png", 10, 3);
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("does not log query secrets from remote image URLs", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const res = await POST(
        makeRequest("https://images.example/photo.png?token=secret-presigned-token"),
      );

      expect(res.status).toBe(200);
      const firstLog = info.mock.calls[0]?.[0] ?? "";
      expect(firstLog).toContain("https://images.example/photo.png");
      expect(firstLog).not.toContain("secret-presigned-token");
      expect(firstLog).not.toContain("?token=");
      expect(safeFetch).toHaveBeenCalledWith(
        "https://images.example/photo.png?token=secret-presigned-token",
        expect.objectContaining({ maxBodyBytes: 4 * 1024 * 1024 }),
      );
    } finally {
      info.mockRestore();
    }
  });

  it("mappar safeFetch 413 till den svenska storleksgränsen", async () => {
    safeFetch.mockResolvedValue(new Response("Response exceeded maxBodyBytes", { status: 413 }));

    const res = await POST(makeRequest("https://images.example/huge.png"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("för stor");
    expect(safeFetch).toHaveBeenCalledWith(
      "https://images.example/huge.png",
      expect.objectContaining({ maxBodyBytes: 4 * 1024 * 1024 }),
    );
  });

  it.each([
    ["invalid JSON", "not-json"],
    ["null", "null"],
    ["array", "[]"],
    ["object URL", '{"url":{}}'],
    ["object source", '{"url":"https://images.example/a.png","source":{}}'],
    ["object photographer", '{"url":"https://images.example/a.png","photographer":{}}'],
  ])("rejects %s before fetching", async (_label, body) => {
    const res = await POST(makeRawRequest(body));

    expect(res.status).toBe(400);
    expect(safeFetch).not.toHaveBeenCalled();
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  it.each([
    { url: `https://images.example/${"x".repeat(4_100)}` },
    { url: "https://images.example/a.png", filename: "x".repeat(256) },
    { url: "https://images.example/a.png", source: "x".repeat(101) },
    { url: "https://images.example/a.png", photographer: "x".repeat(201) },
  ])("rejects oversized remote image fields before fetching", async (body) => {
    const res = await POST(makeRawRequest(JSON.stringify(body)));

    expect(res.status).toBe(400);
    expect(safeFetch).not.toHaveBeenCalled();
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  it("rejects an oversized request body before fetching", async () => {
    const request = makeRawRequest("{}");
    request.headers.set("content-length", "16385");

    const res = await POST(request);

    expect(res.status).toBe(413);
    expect(safeFetch).not.toHaveBeenCalled();
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  it("does not expose unexpected fetch errors", async () => {
    safeFetch.mockRejectedValue(new Error("internal proxy credential"));

    const res = await POST(makeRequest("https://images.example/failure.png"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ success: false, error: "Kunde inte spara bilden" });
    expect(JSON.stringify(body)).not.toContain("credential");
  });
});
