import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.resetAllMocks();
    safeFetch.mockImplementation(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    put.mockResolvedValue({ url: "https://blob.example/pic.png" });
  });
  afterEach(() => vi.restoreAllMocks());

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

  const input = {
    files: [{ name: "index.html", content: 'src="https://cdn.example/one.png" src="https://cdn.example/two.png"' }],
    strategy: "blob" as const, blobToken: "token", namespace: { chatId: "chat", versionId: "v1" },
  };

  it.each(["abort", "deadline", "invalid deadline"])("does not fetch or upload after initial %s", async (mode) => {
    const controller = new AbortController();
    if (mode === "abort") controller.abort();
    const result = await materializeImagesInTextFiles({ ...input, signal: controller.signal,
      ...(mode === "deadline" ? { deadlineEpochMs: Date.now() - 1 } : {}),
      ...(mode === "invalid deadline" ? { deadlineEpochMs: NaN } : {}),
    });
    expect(result.summary.uploaded).toBe(0);
    expect(result.summary.replaced).toBe(0);
    expect(result.files).toEqual(input.files);
    expect(safeFetch).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("propagates abort to safeFetch and does not upload its late result", async () => {
    const controller = new AbortController();
    safeFetch.mockImplementation(async () => {
      controller.abort();
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
    });
    const result = await materializeImagesInTextFiles({ ...input, signal: controller.signal });
    expect(safeFetch).toHaveBeenCalledExactlyOnceWith("https://cdn.example/one.png", expect.objectContaining({ signal: controller.signal }));
    expect(put).not.toHaveBeenCalled();
    expect(result.summary.replaced).toBe(0);
  });

  it("does not start another fetch/upload after abort during an existing upload", async () => {
    const controller = new AbortController();
    put.mockImplementation(async () => { controller.abort(); return { url: "https://blob.example/pic.png" }; });
    const result = await materializeImagesInTextFiles({ ...input, signal: controller.signal });
    expect(safeFetch).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
    expect(result.summary.uploaded).toBe(1);
    expect(result.warnings.some((warning) => warning.includes("aborted"))).toBe(true);
  });

  it("shrinks the per-image fetch timeout to the remaining whole-pass deadline", async () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    await materializeImagesInTextFiles({ ...input, deadlineEpochMs: 600, limits: { maxImages: 1 } });
    expect(safeFetch).toHaveBeenCalledExactlyOnceWith("https://cdn.example/one.png", expect.objectContaining({
      timeoutMs: 500, maxBodyBytes: 4 * 1024 * 1024,
    }));
    expect(put).toHaveBeenCalledTimes(1);
  });

  it.each(["fetch", "upload"])("does not start another upload when deadline expires during %s", async (stage) => {
    let clock = 100;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    if (stage === "fetch") safeFetch.mockImplementation(async () => {
      clock = 200;
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
    });
    else put.mockImplementation(async () => { clock = 200; return { url: "https://blob.example/pic.png" }; });
    await materializeImagesInTextFiles({ ...input, deadlineEpochMs: 150 });
    expect(safeFetch).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(stage === "fetch" ? 0 : 1);
  });

  it("retains the legacy multi-image behavior when no abort/deadline is supplied", async () => {
    const result = await materializeImagesInTextFiles(input);
    expect(safeFetch).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledTimes(2);
    expect(result.summary).toMatchObject({ uploaded: 2, replaced: 2, totalBytesUploaded: 6 });
    for (const [, options] of safeFetch.mock.calls) {
      expect(options.timeoutMs).toBe(30_000);
      expect(options).not.toHaveProperty("signal");
    }
  });

  it("retains the default image-count cap with a supplied signal", async () => {
    const files = [{ name: "index.html", content: Array.from({ length: 41 }, (_, i) => `src="https://cdn.example/${i}.png"`).join(" ") }];
    await materializeImagesInTextFiles({ ...input, files, signal: new AbortController().signal });
    expect(put).toHaveBeenCalledTimes(40);
  });

  it("retains the total-byte cap before starting an upload", async () => {
    const result = await materializeImagesInTextFiles({ ...input, limits: { maxTotalBytes: 2 }, signal: new AbortController().signal });
    expect(result.summary.uploaded).toBe(0);
    expect(put).not.toHaveBeenCalled();
    expect(result.warnings.some((warning) => warning.includes("max total image upload size"))).toBe(true);
  });
});
