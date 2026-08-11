import { describe, expect, it } from "vitest";
import {
  EMBEDDINGS_ARTIFACTS,
  EMBEDDINGS_GIT_TRACKED_FORBIDDEN_PATHS,
  getEmbeddingsBlobKey,
  getEmbeddingsLocalPath,
} from "./embeddings-storage";

describe("embeddings-storage contract", () => {
  it("exposes stable blob keys under embeddings/", () => {
    expect(getEmbeddingsBlobKey("template")).toBe("embeddings/template-embeddings.json");
    expect(getEmbeddingsBlobKey("scaffold")).toBe("embeddings/scaffold-embeddings.json");
    expect(getEmbeddingsBlobKey("variant")).toBe("embeddings/variant-embeddings.json");
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
