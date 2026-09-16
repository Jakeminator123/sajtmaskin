import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetch = vi.hoisted(() => vi.fn());
const uploadBlob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ssrf-guard", () => ({
  validateSsrfTarget: () => ({ ok: true }),
  safeFetch,
}));

vi.mock("@/lib/vercel/blob-service", () => ({
  generateUniqueFilename: (filename: string) => filename,
  uploadBlob,
}));

import { rehostAuditSourceImages } from "./rehost-remote-image";

function imageResponse(contentType = "image/jpeg") {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "content-type": contentType, "content-length": "3" },
  });
}

describe("rehostAuditSourceImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadBlob.mockResolvedValue({
      url: "https://blob.example/rehosted.jpg",
      path: "user_1/media/rehosted.jpg",
      storageType: "blob",
    });
  });

  it("rehosts at most three images and skips silent failures", async () => {
    safeFetch
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(imageResponse("image/png"))
      .mockResolvedValueOnce(imageResponse("image/webp"));

    uploadBlob
      .mockResolvedValueOnce({
        url: "https://blob.example/a.jpg",
        path: "a",
        storageType: "blob",
      })
      .mockResolvedValueOnce({
        url: "https://blob.example/b.png",
        path: "b",
        storageType: "blob",
      })
      .mockResolvedValueOnce({
        url: "https://blob.example/c.webp",
        path: "c",
        storageType: "blob",
      });

    const attachments = await rehostAuditSourceImages({
      userId: "user_1",
      images: [
        { url: "https://granit.se/a.jpg", kind: "content", alt: "Fasad" },
        { url: "https://granit.se/fail.jpg", kind: "content" },
        { url: "https://granit.se/throw.jpg", kind: "content" },
        { url: "https://granit.se/logo.png", kind: "logo", alt: "Logo" },
        { url: "https://granit.se/extra.webp", kind: "og" },
      ],
    });

    expect(attachments.map((item) => item.url)).toEqual([
      "https://blob.example/a.jpg",
      "https://blob.example/b.png",
      "https://blob.example/c.webp",
    ]);
    expect(safeFetch).toHaveBeenCalledTimes(5);
    expect(uploadBlob).toHaveBeenCalledTimes(3);
  });
});
