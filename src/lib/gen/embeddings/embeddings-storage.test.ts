import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
}));

vi.mock("@/lib/ssrf-guard", () => ({
  safeFetch: safeFetchMock,
}));

import {
  EMBEDDINGS_ARTIFACTS,
  EMBEDDINGS_GIT_TRACKED_FORBIDDEN_PATHS,
  getEmbeddingsBlobKey,
  getEmbeddingsLocalPath,
  invalidateEmbeddingsArtifactCache,
  loadEmbeddingsArtifact,
} from "./embeddings-storage";

const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

beforeEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  safeFetchMock.mockReset();
  invalidateEmbeddingsArtifactCache();
});

afterEach(() => {
  if (originalBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
  invalidateEmbeddingsArtifactCache();
});

describe("embeddings-storage contract", () => {
  it("exposes stable blob keys under embeddings/", () => {
    expect(getEmbeddingsBlobKey("template")).toBe("embeddings/template-embeddings.json");
    expect(getEmbeddingsBlobKey("scaffold")).toBe("embeddings/scaffold-embeddings.json");
    expect(getEmbeddingsBlobKey("variant")).toBe("embeddings/variant-embeddings.json");
  });

  it("loads public manifest artifacts through a bounded SSRF-safe fetch", async () => {
    safeFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ vectors: [1, 2, 3] }), { status: 200 }),
    );

    await expect(loadEmbeddingsArtifact("template")).resolves.toEqual({ vectors: [1, 2, 3] });
    expect(safeFetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//),
      expect.objectContaining({ cache: "no-store", maxBodyBytes: 20 * 1024 * 1024 }),
    );
  });

  it("forbidden git paths match artifact localRelPath list", () => {
    const expected = Object.values(EMBEDDINGS_ARTIFACTS).map((a) => a.localRelPath);
    expect([...EMBEDDINGS_GIT_TRACKED_FORBIDDEN_PATHS].sort()).toEqual([...expected].sort());
  });

  it("local paths resolve under cwd", () => {
    for (const id of Object.keys(EMBEDDINGS_ARTIFACTS) as Array<
      keyof typeof EMBEDDINGS_ARTIFACTS
    >) {
      const p = getEmbeddingsLocalPath(id);
      expect(p.replace(/\\/g, "/")).toContain(EMBEDDINGS_ARTIFACTS[id].localRelPath);
    }
  });
});
