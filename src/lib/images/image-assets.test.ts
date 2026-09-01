import { lookup } from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const put = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob", () => ({ put }));

vi.mock("node:dns/promises", () => {
  const lookup = vi.fn();
  return { lookup, default: { lookup } };
});
const mockedLookup = vi.mocked(lookup);

const { materializeImagesInTextFiles } = await import("./image-assets");

const originalFetch = globalThis.fetch;

const PUBLIC_IMAGE_URL = "https://images.example.com/hero.png";
const BLOB_URL = "https://public.blob.vercel-storage.com/images/chat/ver/abc.png";

function pngResponse(body: Uint8Array = new Uint8Array([137, 80, 78, 71])): Response {
  return new Response(body.buffer as ArrayBuffer, {
    status: 200,
    headers: { "content-type": "image/png", "content-length": String(body.byteLength) },
  });
}

function filesWith(url: string) {
  return [{ name: "page.tsx", content: `<img src="${url}" alt="" />` }];
}

function materialize(url: string) {
  return materializeImagesInTextFiles({
    files: filesWith(url),
    strategy: "blob",
    blobToken: "test-blob-token",
    namespace: { chatId: "chat-1", versionId: "ver-1" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
  put.mockResolvedValue({ url: BLOB_URL, pathname: "images/chat-1/ver-1/hash.png" });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("materializeImagesInTextFiles SSRF guard", () => {
  it.each([
    "http://169.254.169.254/a.png",
    "http://192.168.1.10/a.png",
    "http://10.0.0.8/a.png",
    "http://[::1]/a.png",
  ])("refuses private/metadata target %s and does not upload", async (url) => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const result = await materialize(url);

    expect(result.summary.uploaded).toBe(0);
    expect(result.summary.skipped).toBe(1);
    expect(result.assets).toHaveLength(0);
    expect(result.files[0]?.content).toContain(url);
    expect(result.warnings.some((w) => w.includes(url))).toBe(true);
    expect(put).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refuses a public URL that redirects to a private address and does not upload", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "http://169.254.169.254/a.png" },
      }),
    ) as unknown as typeof fetch;

    const result = await materialize(PUBLIC_IMAGE_URL);

    expect(result.summary.uploaded).toBe(0);
    expect(result.summary.skipped).toBe(1);
    expect(result.assets).toHaveLength(0);
    expect(result.files[0]?.content).toContain(PUBLIC_IMAGE_URL);
    expect(result.warnings.some((w) => w.includes(PUBLIC_IMAGE_URL))).toBe(true);
    expect(put).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("materializes a normal public image URL (regression)", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10]);
    globalThis.fetch = vi.fn().mockResolvedValue(pngResponse(bytes)) as unknown as typeof fetch;

    const result = await materialize(PUBLIC_IMAGE_URL);

    expect(result.summary.uploaded).toBe(1);
    expect(result.summary.skipped).toBe(0);
    expect(result.summary.replaced).toBe(1);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]?.sourceUrl).toBe(PUBLIC_IMAGE_URL);
    expect(result.assets[0]?.blobUrl).toBe(BLOB_URL);
    expect(result.files[0]?.content).toContain(BLOB_URL);
    expect(result.files[0]?.content).not.toContain(PUBLIC_IMAGE_URL);
    expect(put).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
