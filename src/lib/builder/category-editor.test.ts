import { describe, expect, it } from "vitest";
import {
  readCategoryItemsDraft,
  updateCategoryItemsDraft,
  type CategoryItemDraft,
} from "./category-editor";

describe("category-editor", () => {
  describe("readCategoryItemsDraft", () => {
    it("reads category names from page files", () => {
      const content = [
        "const categories = [",
        "  { name: 'Kategori 1', slug: 'cat-1', image: '/a.jpg' },",
        "  { name: 'Kategori 2', slug: 'cat-2', image: '/b.jpg' },",
        "];",
      ].join("\n");

      expect(readCategoryItemsDraft("app/page.tsx", content)).toEqual([
        { name: "Kategori 1" },
        { name: "Kategori 2" },
      ]);
    });

    it("returns null for non-page files", () => {
      const content = [
        "const categories = [",
        "  { name: 'Kategori 1', slug: 'cat-1', image: '/a.jpg' },",
        "  { name: 'Kategori 2', slug: 'cat-2', image: '/b.jpg' },",
        "];",
      ].join("\n");

      expect(readCategoryItemsDraft("components/categories.tsx", content)).toBeNull();
    });

    it("returns null when fewer than two items exist", () => {
      const content = [
        "const categories = [",
        "  { name: 'Kategori 1', slug: 'cat-1', image: '/a.jpg' },",
        "];",
      ].join("\n");

      expect(readCategoryItemsDraft("app/page.tsx", content)).toBeNull();
    });
  });

  describe("updateCategoryItemsDraft", () => {
    it("updates category names in place", () => {
      const content = [
        "const categories = [",
        "  { name: 'Kategori 1', slug: 'cat-1', image: '/a.jpg' },",
        "  { name: 'Kategori 2', slug: 'cat-2', image: '/b.jpg' },",
        "];",
      ].join("\n");

      const nextItems: CategoryItemDraft[] = [
        { name: "Ny kategori" },
        { name: "Presenttips" },
      ];

      const updated = updateCategoryItemsDraft(content, nextItems);
      expect(updated).toContain("name: 'Ny kategori'");
      expect(updated).toContain("name: 'Presenttips'");
    });

    it("returns content unchanged when no edits exist", () => {
      const content = [
        "const categories = [",
        "  { name: 'Kategori 1', slug: 'cat-1', image: '/a.jpg' },",
        "  { name: 'Kategori 2', slug: 'cat-2', image: '/b.jpg' },",
        "];",
      ].join("\n");

      const nextItems: CategoryItemDraft[] = [
        { name: "Kategori 1" },
        { name: "Kategori 2" },
      ];

      expect(updateCategoryItemsDraft(content, nextItems)).toBe(content);
    });
  });
});
