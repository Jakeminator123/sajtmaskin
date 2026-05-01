import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const safeFetch = vi.hoisted(() => vi.fn());
const uploadBlob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/ssrf-guard", () => ({
  validateSsrfTarget: () => ({ ok: true }),
  safeFetch,
}));

vi.mock("@/lib/rateLimit", () => ({
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

describe("POST /api/media/upload-from-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
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
    } finally {
      info.mockRestore();
    }
  });
});
