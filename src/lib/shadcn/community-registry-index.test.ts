import { afterEach, describe, expect, it, vi } from "vitest";
import {
  categoryFromCommunityName,
  clearCommunityRegistryIndexCache,
  decodeCursor,
  FEATURED_SHADCNBLOCKS,
  filterCommunityIndexItems,
  normalizeCommunityIndexItem,
  paginateCommunityIndexItems,
  parseCommunityRegistryIndex,
  queryCommunityRegistryIndex,
} from "./community-registry-index";

afterEach(() => {
  clearCommunityRegistryIndexCache();
  vi.unstubAllGlobals();
});

describe("categoryFromCommunityName", () => {
  it("strips trailing digits for known marketing prefixes", () => {
    expect(categoryFromCommunityName("hero1")).toBe("hero");
    expect(categoryFromCommunityName("pricing12")).toBe("pricing");
    expect(categoryFromCommunityName("testimonial3")).toBe("testimonial");
    expect(categoryFromCommunityName("cta1")).toBe("cta");
  });

  it("falls back for unknown prefixes", () => {
    expect(categoryFromCommunityName("widget99")).toBe("widget");
  });
});

describe("parseCommunityRegistryIndex", () => {
  it("strips files and keeps gallery fields", () => {
    const items = parseCommunityRegistryIndex({
      name: "shadcnblocks",
      items: [
        {
          name: "hero1",
          type: "registry:block",
          title: "Hero 1",
          description: "Split hero",
          files: [{ path: "huge.tsx", content: "x".repeat(5000) }],
        },
        { name: "  ", type: "registry:block" },
        { type: "registry:block" },
      ],
    });
    expect(items).toEqual([
      {
        name: "hero1",
        type: "registry:block",
        title: "Hero 1",
        description: "Split hero",
        category: "hero",
      },
    ]);
    expect(JSON.stringify(items)).not.toContain("huge.tsx");
  });

  it("throws when items are missing", () => {
    expect(() => parseCommunityRegistryIndex({ name: "x" })).toThrow(/saknar items/i);
  });
});

describe("normalizeCommunityIndexItem", () => {
  it("prefers explicit categories[0] when present", () => {
    expect(
      normalizeCommunityIndexItem({
        name: "hero1",
        categories: ["marketing"],
      })?.category,
    ).toBe("marketing");
  });
});

describe("filter + paginate", () => {
  const sample = parseCommunityRegistryIndex({
    items: [
      { name: "hero1", title: "Hero 1", description: "A", type: "registry:block" },
      { name: "hero2", title: "Hero 2", description: "B", type: "registry:block" },
      { name: "pricing1", title: "Pricing 1", description: "C", type: "registry:block" },
      { name: "faq1", title: "FAQ 1", description: "D", type: "registry:block" },
    ],
  });

  it("filters by category and query", () => {
    expect(filterCommunityIndexItems(sample, { category: "hero" }).map((i) => i.name)).toEqual([
      "hero1",
      "hero2",
    ]);
    expect(filterCommunityIndexItems(sample, { q: "pricing" }).map((i) => i.name)).toEqual([
      "pricing1",
    ]);
  });

  it("paginates with opaque cursors", () => {
    const page1 = paginateCommunityIndexItems(sample, { limit: 2 });
    expect(page1.items.map((i) => i.name)).toEqual(["hero1", "hero2"]);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = paginateCommunityIndexItems(sample, {
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items.map((i) => i.name)).toEqual(["pricing1", "faq1"]);
    expect(page2.nextCursor).toBeNull();
    expect(decodeCursor(page1.nextCursor)).toBe(2);
  });
});

describe("queryCommunityRegistryIndex", () => {
  it("returns featured names without pagination and caches the index", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        items: [
          ...FEATURED_SHADCNBLOCKS.map((f) => ({
            name: f.name,
            type: "registry:block",
            title: `${f.labelSv} title`,
            description: `${f.name} desc`,
          })),
          { name: "hero99", type: "registry:block", title: "Extra", description: "x" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await queryCommunityRegistryIndex({
      names: FEATURED_SHADCNBLOCKS.map((f) => f.name),
    });
    expect(page.namespace).toBe("@shadcnblocks");
    expect(page.items).toHaveLength(FEATURED_SHADCNBLOCKS.length);
    expect(page.nextCursor).toBeNull();
    expect(page.items.every((i) => i.title.includes("title"))).toBe(true);

    await queryCommunityRegistryIndex({ limit: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
