/**
 * Template search load path + fallback (steg 7b: embeddings ur serverbundlen).
 *
 * The embeddings JSON is ~9 MiB and is no longer `require()`d, so the semantic
 * path now depends on an async load (Blob in deployed runtimes, fs in dev).
 * That makes "the load failed" a normal runtime state — and the one state that
 * must never turn into a silent empty result list. These tests pin:
 *   (a) loaded embeddings   → semantic ranking is used,
 *   (b) load failure        → non-empty keyword fallback,
 *   (c) load failure        → a loud console.error, and one retry on next call.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { getTemplateCatalog } from "@/lib/templates/template-catalog";
import { invalidateEmbeddingsCache, searchTemplates } from "@/lib/templates/template-search";

const loadTemplateEmbeddings = vi.fn();
const createEmbedding = vi.fn();

vi.mock("@/lib/templates/template-embeddings-storage", () => ({
  loadTemplateEmbeddings: (...args: unknown[]) => loadTemplateEmbeddings(...args),
}));

vi.mock("@/lib/config", () => ({
  SECRETS: { openaiApiKey: "test-key" },
}));

vi.mock("openai", () => ({
  default: class {
    embeddings = { create: (...args: unknown[]) => createEmbedding(...args) };
  },
}));

const catalog = getTemplateCatalog();
const targetTemplate = catalog[0];
const otherTemplate = catalog[1];

/** Query built from a real catalog title so the keyword fallback can match it. */
const keywordQuery = targetTemplate.title;

function embeddingsFor(entries: Array<{ id: string; embedding: number[] }>) {
  return {
    data: { _meta: { model: "test", dimensions: 3, generated: "", count: entries.length }, embeddings: entries },
    mode: "blob" as const,
    location: "https://blob.test/template-embeddings.json",
  };
}

let errorSpy: MockInstance;

beforeEach(() => {
  loadTemplateEmbeddings.mockReset();
  createEmbedding.mockReset();
  invalidateEmbeddingsCache();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("searchTemplates — embeddings loaded", () => {
  it("ranks templates by cosine similarity from the lazily loaded embeddings", async () => {
    loadTemplateEmbeddings.mockResolvedValue(
      embeddingsFor([
        { id: otherTemplate.id, embedding: [0, 1, 0] },
        { id: targetTemplate.id, embedding: [1, 0, 0] },
      ]),
    );
    createEmbedding.mockResolvedValue({ data: [{ embedding: [1, 0, 0] }] });

    const results = await searchTemplates("nagot helt annat an titeln", 2);

    expect(loadTemplateEmbeddings).toHaveBeenCalledTimes(1);
    expect(createEmbedding).toHaveBeenCalledTimes(1);
    expect(results[0].template.id).toBe(targetTemplate.id);
    expect(results[0].score).toBeGreaterThan(0.9);
  });

  it("caches the loaded embeddings for the process (one read per source)", async () => {
    loadTemplateEmbeddings.mockResolvedValue(
      embeddingsFor([{ id: targetTemplate.id, embedding: [1, 0, 0] }]),
    );
    createEmbedding.mockResolvedValue({ data: [{ embedding: [1, 0, 0] }] });

    await Promise.all([searchTemplates("en", 1), searchTemplates("tva", 1)]);
    await searchTemplates("tre", 1);

    expect(loadTemplateEmbeddings).toHaveBeenCalledTimes(1);

    invalidateEmbeddingsCache();
    await searchTemplates("fyra", 1);
    expect(loadTemplateEmbeddings).toHaveBeenCalledTimes(2);
  });
});

describe("searchTemplates — embeddings unavailable", () => {
  it("falls back to a non-empty keyword search when the Blob read fails", async () => {
    loadTemplateEmbeddings.mockRejectedValue(new Error("HTTP 503"));

    const results = await searchTemplates(keywordQuery, 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results.map((r) => r.template.id)).toContain(targetTemplate.id);
    expect(createEmbedding).not.toHaveBeenCalled();
  });

  it("falls back to keyword search when the local file is missing", async () => {
    loadTemplateEmbeddings.mockRejectedValue(
      Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" }),
    );

    const results = await searchTemplates(keywordQuery, 5);

    expect(results.length).toBeGreaterThan(0);
  });

  it("logs a loud load error instead of failing silently", async () => {
    const cause = new Error("Blob-hamtning av template embeddings misslyckades: HTTP 404");
    loadTemplateEmbeddings.mockRejectedValue(cause);

    await searchTemplates(keywordQuery, 5);

    expect(errorSpy).toHaveBeenCalledWith(
      "[template-search] Failed to load template embeddings:",
      cause,
    );
  });

  it("retries the load on the next search after a failure", async () => {
    loadTemplateEmbeddings.mockRejectedValueOnce(new Error("transient"));
    await searchTemplates(keywordQuery, 5);
    expect(loadTemplateEmbeddings).toHaveBeenCalledTimes(2);

    loadTemplateEmbeddings.mockResolvedValue(
      embeddingsFor([{ id: targetTemplate.id, embedding: [1, 0, 0] }]),
    );
    createEmbedding.mockResolvedValue({ data: [{ embedding: [1, 0, 0] }] });

    const results = await searchTemplates("nagot helt annat an titeln", 1);
    expect(results[0].template.id).toBe(targetTemplate.id);
  });

  it("uses the keyword fallback when the source returns zero entries", async () => {
    loadTemplateEmbeddings.mockResolvedValue(embeddingsFor([]));

    const results = await searchTemplates(keywordQuery, 5);

    expect(results.length).toBeGreaterThan(0);
    expect(createEmbedding).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("contained 0 entries"),
    );
  });
});
