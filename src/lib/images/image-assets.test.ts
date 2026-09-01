import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetch = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ssrf-guard", () => ({ safeFetch }));
vi.mock("@/lib/storage/vercel-blob-provider", () => ({
  VercelBlobProvider: class {
    put = put;
  },
}));

const { materializeImagesInTextFiles } = await import("./image-assets");

describe("materializeImagesInTextFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    safeFetch.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    put.mockResolvedValue({ url: "https://blob.example/pic.png" });
  });

  it("hämtar bilder via safeFetch med caller-styrd maxBodyBytes", async () => {
    await materializeImagesInTextFiles({
      files: [{ name: "index.html", content: `src="https://cdn.example/pic.png"` }],
      strategy: "blob",
      blobToken: "token",
      namespace: { chatId: "chat", versionId: "v1" },
    });

    expect(safeFetch).toHaveBeenCalledWith(
      "https://cdn.example/pic.png",
      expect.objectContaining({
        maxBodyBytes: 4 * 1024 * 1024,
        timeoutMs: 30_000,
      }),
    );
    expect(put).toHaveBeenCalled();
  });

  it("fail-stänger på 413 utan att kasta ut ur materialiseringen", async () => {
    safeFetch.mockResolvedValue(new Response("Response exceeded maxBodyBytes", { status: 413 }));

    const result = await materializeImagesInTextFiles({
      files: [{ name: "index.html", content: `src="https://cdn.example/huge.png"` }],
      strategy: "blob",
      blobToken: "token",
      namespace: { chatId: "chat", versionId: "v1" },
    });

    expect(result.summary.uploaded).toBe(0);
    expect(result.summary.skipped).toBe(1);
    expect(result.warnings.some((warning) => warning.includes("HTTP 413"))).toBe(true);
    expect(put).not.toHaveBeenCalled();
  });
});
