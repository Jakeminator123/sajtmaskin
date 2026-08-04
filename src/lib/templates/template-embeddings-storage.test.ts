/**
 * Storage owner for template embeddings (steg 7b).
 *
 * Pins the two load paths — deployed runtime reads the Blob URL, dev reads the
 * committed file via fs — and that every failure surfaces as a thrown error
 * naming its source, so `template-search` can degrade loudly to keyword search.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCacheForTests } from "@/lib/env";
import {
  TEMPLATE_EMBEDDINGS_LOCAL_PATH,
  loadTemplateEmbeddings,
  resolveTemplateEmbeddingsStorageMode,
} from "@/lib/templates/template-embeddings-storage";

const BLOB_URL = "https://example.public.blob.vercel-storage.com/template-embeddings.json";

function setEnv(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value);
  }
  resetServerEnvCacheForTests();
}

beforeEach(() => {
  setEnv({ VERCEL: undefined, VERCEL_ENV: undefined, TEMPLATE_EMBEDDINGS_BLOB_URL: undefined });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetServerEnvCacheForTests();
});

describe("resolveTemplateEmbeddingsStorageMode", () => {
  it("reads the local file outside deployed runtimes", () => {
    expect(resolveTemplateEmbeddingsStorageMode()).toBe("local");
  });

  it("reads from blob in a deployed runtime", () => {
    setEnv({ VERCEL: "1" });
    expect(resolveTemplateEmbeddingsStorageMode()).toBe("blob");
  });

  it("honors an explicit local preference even when deployed", () => {
    setEnv({ VERCEL: "1", VERCEL_ENV: "production" });
    expect(resolveTemplateEmbeddingsStorageMode("local")).toBe("local");
  });
});

describe("loadTemplateEmbeddings — blob", () => {
  it("fetches the configured read URL", async () => {
    setEnv({ VERCEL: "1", TEMPLATE_EMBEDDINGS_BLOB_URL: BLOB_URL });
    const payload = {
      _meta: { model: "text-embedding-3-small", dimensions: 3, generated: "", count: 1 },
      embeddings: [{ id: "abc", embedding: [1, 0, 0] }],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadTemplateEmbeddings();

    expect(fetchMock).toHaveBeenCalledWith(BLOB_URL, expect.objectContaining({ cache: "no-store" }));
    expect(result.mode).toBe("blob");
    expect(result.location).toBe(BLOB_URL);
    expect(result.data.embeddings).toHaveLength(1);
  });

  it("names the missing env key when the read URL is unset", async () => {
    setEnv({ VERCEL: "1" });
    await expect(loadTemplateEmbeddings()).rejects.toThrow(/TEMPLATE_EMBEDDINGS_BLOB_URL/);
  });

  it("throws with the HTTP status when the blob read fails", async () => {
    setEnv({ VERCEL: "1", TEMPLATE_EMBEDDINGS_BLOB_URL: BLOB_URL });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));

    await expect(loadTemplateEmbeddings()).rejects.toThrow(/HTTP 404/);
  });

  it("rejects a payload without an embeddings array", async () => {
    setEnv({ VERCEL: "1", TEMPLATE_EMBEDDINGS_BLOB_URL: BLOB_URL });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ _meta: {} }) }),
    );

    await expect(loadTemplateEmbeddings()).rejects.toThrow(/ogiltigt format/);
  });

  it("never fetches in local mode", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setEnv({ TEMPLATE_EMBEDDINGS_BLOB_URL: BLOB_URL });

    await loadTemplateEmbeddings();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("loadTemplateEmbeddings — local file", () => {
  it("reads the committed artifact from disk", async () => {
    const result = await loadTemplateEmbeddings();

    expect(result.mode).toBe("local");
    expect(result.location).toBe(TEMPLATE_EMBEDDINGS_LOCAL_PATH);
    expect(result.data.embeddings.length).toBeGreaterThan(0);
    expect(result.data.embeddings[0].embedding.length).toBeGreaterThan(0);
  });
});
