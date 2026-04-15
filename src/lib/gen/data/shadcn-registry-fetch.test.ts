import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchMissingRegistryExamples } from "./shadcn-registry-fetch";
import type { ComponentReference } from "./shadcn-example-loader";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRegistryResponse(name: string, style: string) {
  return {
    ok: true,
    json: async () => ({
      name,
      files: [
        {
          path: `registry/${style}/ui/${name}.tsx`,
          content: `import { cn } from "@/registry/${style}/lib/utils";\nexport function ${name}() { return null; }`,
          type: "registry:ui",
        },
      ],
    }),
  };
}

describe("fetchMissingRegistryExamples", () => {
  it("returns empty when all names are already in local results", async () => {
    const local: ComponentReference[] = [{ name: "button", code: "..." }];
    const result = await fetchMissingRegistryExamples(["button"], local);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches missing items and rewrites imports", async () => {
    mockFetch.mockResolvedValueOnce(makeRegistryResponse("card", "radix-vega"));
    const local: ComponentReference[] = [{ name: "button", code: "..." }];
    const result = await fetchMissingRegistryExamples(["button", "card"], local);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("card");
    expect(result[0].code).toContain('@/lib/utils');
    expect(result[0].code).not.toContain('@/registry/');
  });

  it("limits fetches to MAX_REMOTE_FETCHES (3) items", async () => {
    mockFetch.mockResolvedValue(makeRegistryResponse("x", "radix-vega"));
    const result = await fetchMissingRegistryExamples(
      ["a", "b", "c", "d", "e"],
      [],
    );
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("falls back to new-york-v4 when radix-vega 404s", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce(makeRegistryResponse("chart-bar-default", "new-york-v4"));
    const result = await fetchMissingRegistryExamples(["chart-bar-default"], []);
    expect(result).toHaveLength(1);
    expect(result[0].code).toContain('@/lib/utils');
  });

  it("returns empty on network failure without throwing", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    const result = await fetchMissingRegistryExamples(["missing"], []);
    expect(result).toEqual([]);
  });
});
