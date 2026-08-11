import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { getAllScaffolds } from "./registry";
import type { ScaffoldId } from "./types";
import {
  EMBEDDINGS_ARTIFACTS,
  EMBEDDINGS_GIT_TRACKED_FORBIDDEN_PATHS,
  getEmbeddingsLocalPath,
} from "@/lib/gen/embeddings/embeddings-storage";

describe("scaffold-embeddings parity", () => {
  it("has exactly one embedding per registered scaffold id (local cache or skip)", () => {
    const localPath = getEmbeddingsLocalPath("scaffold");
    if (!existsSync(localPath)) {
      console.warn(
        `[skip] ${localPath} missing — run: npm run embeddings:sync (or scaffolds:embeddings)`,
      );
      return;
    }
    const scaffoldEmbeddings = JSON.parse(readFileSync(localPath, "utf-8")) as {
      embeddings: Array<{ id: string }>;
    };
    const registered = new Set(getAllScaffolds().map((s) => s.id));
    const embedded = new Set(scaffoldEmbeddings.embeddings.map((e) => e.id));
    expect(embedded.size).toBe(registered.size);
    for (const id of registered) {
      expect(embedded.has(id), `missing embedding for ${id}`).toBe(true);
    }
    for (const id of embedded) {
      expect(registered.has(id as ScaffoldId), `orphan embedding id ${id}`).toBe(true);
    }
  });
});

describe("embeddings storage contract", () => {
  it("forbidden git paths match artifact map", () => {
    const fromMap = Object.values(EMBEDDINGS_ARTIFACTS).map((a) => a.localRelPath);
    expect([...EMBEDDINGS_GIT_TRACKED_FORBIDDEN_PATHS].sort()).toEqual([...fromMap].sort());
  });
});
