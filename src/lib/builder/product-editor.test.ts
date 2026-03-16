import { describe, expect, it } from "vitest";
import {
  readProductItemsDraft,
  updateProductItemsDraft,
  type ProductItemDraft,
} from "./product-editor";

describe("product-editor", () => {
  describe("readProductItemsDraft", () => {
    it("reads product name and price from page files", () => {
      const content = [
        "const featuredProducts = [",
        "  { id: '1', name: 'Produkt 1', price: '199 kr', image: '/a.jpg' },",
        "  { id: '2', name: 'Produkt 2', price: '299 kr', image: '/b.jpg' },",
        "];",
      ].join("\n");
      expect(readProductItemsDraft("app/page.tsx", content)).toEqual([
        { name: "Produkt 1", price: "199 kr" },
        { name: "Produkt 2", price: "299 kr" },
      ]);
    });

    it("returns null for non-page files", () => {
      const content = [
        "const featuredProducts = [",
        "  { id: '1', name: 'Produkt 1', price: '199 kr', image: '/a.jpg' },",
        "  { id: '2', name: 'Produkt 2', price: '299 kr', image: '/b.jpg' },",
        "];",
      ].join("\n");
      expect(readProductItemsDraft("components/product-grid.tsx", content)).toBeNull();
    });

    it("returns null when fewer than two items exist", () => {
      const content = [
        "const featuredProducts = [",
        "  { id: '1', name: 'Produkt 1', price: '199 kr', image: '/a.jpg' },",
        "];",
      ].join("\n");
      expect(readProductItemsDraft("app/page.tsx", content)).toBeNull();
    });
  });

  describe("updateProductItemsDraft", () => {
    it("updates product name and price in place", () => {
      const content = [
        "const featuredProducts = [",
        "  { id: '1', name: 'Produkt 1', price: '199 kr', image: '/a.jpg' },",
        "  { id: '2', name: 'Produkt 2', price: '299 kr', image: '/b.jpg' },",
        "];",
      ].join("\n");
      const nextItems: ProductItemDraft[] = [
        { name: "Premiumprodukt", price: "249 kr" },
        { name: "Basprodukt", price: "349 kr" },
      ];
      const updated = updateProductItemsDraft(content, nextItems);
      expect(updated).toContain("name: 'Premiumprodukt'");
      expect(updated).toContain("price: '249 kr'");
      expect(updated).toContain("name: 'Basprodukt'");
      expect(updated).toContain("price: '349 kr'");
    });

    it("returns content unchanged when no edits", () => {
      const content = [
        "const featuredProducts = [",
        "  { id: '1', name: 'Produkt 1', price: '199 kr', image: '/a.jpg' },",
        "  { id: '2', name: 'Produkt 2', price: '299 kr', image: '/b.jpg' },",
        "];",
      ].join("\n");
      const nextItems: ProductItemDraft[] = [
        { name: "Produkt 1", price: "199 kr" },
        { name: "Produkt 2", price: "299 kr" },
      ];
      expect(updateProductItemsDraft(content, nextItems)).toBe(content);
    });
  });
});
