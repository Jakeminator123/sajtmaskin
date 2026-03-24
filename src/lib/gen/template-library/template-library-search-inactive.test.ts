import { afterEach, describe, expect, it, vi } from "vitest";
import * as catalog from "./catalog";
import { searchTemplateLibrary } from "./search";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("searchTemplateLibrary — empty catalog", () => {
  it("returns [] immediately so stale embeddings file is inert (no retrieval side effects)", async () => {
    vi.spyOn(catalog, "getTemplateLibraryEntries").mockReturnValue([]);
    const out = await searchTemplateLibrary("restaurang hemsida med bokning", 5);
    expect(out).toEqual([]);
  });
});
