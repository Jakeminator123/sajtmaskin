import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchCommunityBlocks, _clearCache } from "./community-registry-fetch";
import type { InferredCapabilities } from "../capability-inference";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  _clearCache();
});

function baseCaps(overrides: Partial<InferredCapabilities> = {}): InferredCapabilities {
  return {
    needsMotion: false,
    needs3D: false,
    needsCharts: false,
    needsDatabase: false,
    needsAuth: false,
    needsAppShell: false,
    needsDataUI: false,
    needsForms: false,
    needsEcommerce: false,
    needsCarousel: false,
    needsPremiumVisuals: false,
    needsCalendar: false,
    needsCommandSearch: false,
    needsThemeToggle: false,
    ...overrides,
  };
}

function makeResponse(name: string, _namespace: string) {
  return {
    ok: true,
    json: async () => ({
      name,
      files: [
        {
          path: `block/${name}.tsx`,
          content: `import { cn } from "@/lib/utils";\nimport { Button } from "@/components/ui/button";\nexport function ${name}() { return null; }`,
          type: "registry:block",
        },
      ],
    }),
  };
}

function makeMagicuiResponse(name: string) {
  return {
    ok: true,
    json: async () => ({
      name,
      files: [
        {
          path: `registry/magicui/${name}.tsx`,
          content: `import { cn } from "@/registry/magicui/lib/utils";\nexport function ${name}() { return null; }`,
          type: "registry:ui",
        },
      ],
    }),
  };
}

describe("fetchCommunityBlocks", () => {
  it("returns empty when prompt has no section keywords and no relevant capabilities", async () => {
    const result = await fetchCommunityBlocks(baseCaps(), "build a simple page");
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches a hero block when prompt mentions hero", async () => {
    mockFetch.mockResolvedValue(makeResponse("hero1", "@shadcnblocks"));
    const result = await fetchCommunityBlocks(baseCaps(), "create a landing page with a hero section");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].name).toContain("hero");
    expect(result[0].code).not.toContain("@/registry/");
  });

  it("fetches magicui effects for premium visuals", async () => {
    mockFetch.mockResolvedValue(makeMagicuiResponse("magic-card"));
    const result = await fetchCommunityBlocks(
      baseCaps({ needsPremiumVisuals: true }),
      "build a premium landing page",
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    const magicRef = result.find((r) => r.name.includes("@magicui"));
    expect(magicRef).toBeDefined();
  });

  it("rewrites magicui registry imports to local paths", async () => {
    mockFetch.mockResolvedValue(makeMagicuiResponse("marquee"));
    const result = await fetchCommunityBlocks(
      baseCaps({ needsMotion: true }),
      "add animated marquee",
    );
    const ref = result.find((r) => r.name.includes("marquee"));
    expect(ref).toBeDefined();
    expect(ref!.code).toContain("@/lib/utils");
    expect(ref!.code).not.toContain("@/registry/magicui/");
  });

  it("limits total blocks to MAX_COMMUNITY_BLOCKS (3)", async () => {
    mockFetch.mockResolvedValue(makeResponse("block", "@shadcnblocks"));
    const result = await fetchCommunityBlocks(
      baseCaps({ needsPremiumVisuals: true, needsMotion: true }),
      "landing page with hero features pricing testimonials cta faq footer",
    );
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("returns empty on network failure without throwing", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    const result = await fetchCommunityBlocks(baseCaps(), "hero section with features");
    expect(result).toEqual([]);
  });

  it("picks the same registry items for the same prompt across reruns (deterministic, was Math.random)", async () => {
    // Capture which URLs the registry is asked to fetch for two identical
    // (prompt, capability) inputs. Previously the picker used Math.random()
    // which produced non-reproducible block recipes for the same prompt.
    const seen: string[][] = [];
    for (let run = 0; run < 2; run++) {
      _clearCache();
      const calls: string[] = [];
      mockFetch.mockReset();
      mockFetch.mockImplementation((url: string) => {
        calls.push(url);
        return Promise.resolve(makeResponse("hero1", "@shadcnblocks"));
      });
      await fetchCommunityBlocks(
        baseCaps(),
        "landing page with hero features pricing testimonials cta faq footer",
      );
      seen.push(calls.sort());
    }
    expect(seen[0]).toEqual(seen[1]);
  });
});
