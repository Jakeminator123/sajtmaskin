import { afterEach, describe, expect, it, vi } from "vitest";

import * as storage from "@/lib/gen/embeddings/embeddings-storage";
import { getVariantsForScaffold } from "./registry";
import { pickScaffoldVariantAsyncWithReceipt, pickScaffoldVariantWithReceipt } from "./matcher";

afterEach(() => vi.restoreAllMocks());

describe("variant fallback acceptance without providers", () => {
  const input = {
    prompt: "Professional B2B consulting corporate enterprise services",
    scaffoldId: "landing-page" as const,
    generationMode: "init" as const,
    sessionSeed: "acceptance-variant-fallback",
    queryVector: [1, 0],
  };
  const meta = { model: "synthetic", dimensions: 2, generated: "synthetic", count: 1 };

  it.each([
    ["missing artifact", null],
    ["orphan-only index", {
      _meta: meta,
      embeddings: [{ id: "synthetic-orphan", scaffoldId: "landing-page", embedding: [1, 0] }],
    }],
    ["wrong vector dimension", {
      _meta: meta,
      embeddings: [{
        id: getVariantsForScaffold("landing-page")[0]!.id,
        scaffoldId: "landing-page",
        embedding: [1, 0, 0],
      }],
    }],
  ])("preserves the complete sync receipt for %s", async (_label, artifact) => {
    const load = vi.spyOn(storage, "loadEmbeddingsArtifact").mockResolvedValue(artifact);
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Provider call forbidden"));

    expect(await pickScaffoldVariantAsyncWithReceipt(input)).toEqual(
      pickScaffoldVariantWithReceipt(input),
    );
    expect(load).toHaveBeenCalledWith("variant");
    expect(fetch).not.toHaveBeenCalled();
  });
});
