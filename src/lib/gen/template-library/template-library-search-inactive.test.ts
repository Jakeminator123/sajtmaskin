import { afterEach, describe, expect, it, vi } from "vitest";
import * as catalog from "./catalog";
import {
  searchTemplateLibrary,
  searchTemplateLibraryWithDiagnostics,
} from "./search";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("searchTemplateLibrary — empty catalog", () => {
  it("returns [] immediately so stale embeddings file is inert (no retrieval side effects)", async () => {
    vi.spyOn(catalog, "getTemplateLibraryEntries").mockReturnValue([]);
    const out = await searchTemplateLibrary("restaurang hemsida med bokning", 5);
    expect(out).toEqual([]);
  });

  it("searchTemplateLibraryWithDiagnostics reports empty_catalog and catalogSize 0", async () => {
    vi.spyOn(catalog, "getTemplateLibraryEntries").mockReturnValue([]);
    const { results, diagnostics } = await searchTemplateLibraryWithDiagnostics(
      "restaurang hemsida med bokning",
      5,
    );
    expect(results).toEqual([]);
    expect(diagnostics.mode).toBe("empty_catalog");
    expect(diagnostics.catalogSize).toBe(0);
  });

  it("searchTemplateLibrary returns a plain result array, not the diagnostics wrapper", async () => {
    vi.spyOn(catalog, "getTemplateLibraryEntries").mockReturnValue([]);
    const out = await searchTemplateLibrary("restaurang hemsida med bokning", 5);
    expect(Array.isArray(out)).toBe(true);
    expect(out).toEqual([]);
    expect("results" in out).toBe(false);
    expect("diagnostics" in out).toBe(false);
  });

  it("searchTemplateLibraryWithDiagnostics diagnostics include mode, catalogSize, usedEmbeddings", async () => {
    vi.spyOn(catalog, "getTemplateLibraryEntries").mockReturnValue([]);
    const { diagnostics } = await searchTemplateLibraryWithDiagnostics("query", 3);
    expect(diagnostics).toEqual(
      expect.objectContaining({
        mode: expect.any(String),
        catalogSize: expect.any(Number),
        usedEmbeddings: expect.any(Boolean),
      }),
    );
  });
});
