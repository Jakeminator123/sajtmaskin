import { describe, expect, it } from "vitest";
import {
  filterCategoriesByQuery,
  normalizeSearch,
  type SearchableCategory,
  type SearchableTemplate,
} from "./templates-search";

const categories: SearchableCategory[] = [
  { id: "restaurang", title: "Café & Restaurang", description: "Meny, bokning och öppettider" },
  { id: "kreativ", title: "Portfolio", description: "För kreativa företag och frilansare" },
  { id: "handel", title: "Webbshop", description: "Sälj produkter online" },
];

const templatesByCategory: Record<string, SearchableTemplate[]> = {
  restaurang: [
    { id: "t1", title: "Bistro Ljus" },
    { id: "t2", title: "Frisörsajt Deluxe" },
  ],
  kreativ: [{ id: "t3", title: "Fotografportfölj" }],
  handel: [],
};

describe("normalizeSearch", () => {
  it("lowercases, trims and strips diacritics", () => {
    expect(normalizeSearch("  CaFÉ  ")).toBe("cafe");
    expect(normalizeSearch("För")).toBe("for");
    expect(normalizeSearch("Frisörsajt")).toBe("frisorsajt");
  });
});

describe("filterCategoriesByQuery", () => {
  it("returns every category with its total template count for an empty query", () => {
    const results = filterCategoriesByQuery(categories, templatesByCategory, "   ");
    expect(results).toEqual([
      { id: "restaurang", count: 2 },
      { id: "kreativ", count: 1 },
      { id: "handel", count: 0 },
    ]);
  });

  it("matches category titles accent-insensitively (cafe → Café)", () => {
    const results = filterCategoriesByQuery(categories, templatesByCategory, "cafe");
    expect(results).toEqual([{ id: "restaurang", count: 2 }]);
  });

  it("matches category descriptions accent-insensitively (for → För)", () => {
    const results = filterCategoriesByQuery(categories, templatesByCategory, "for");
    expect(results.map((r) => r.id)).toContain("kreativ");
  });

  it("matches template titles accent-insensitively and counts only the matches", () => {
    const results = filterCategoriesByQuery(categories, templatesByCategory, "frisor");
    expect(results).toEqual([{ id: "restaurang", count: 1 }]);
  });

  it("returns no results when nothing matches", () => {
    const results = filterCategoriesByQuery(categories, templatesByCategory, "zzz-finns-inte");
    expect(results).toEqual([]);
  });
});
