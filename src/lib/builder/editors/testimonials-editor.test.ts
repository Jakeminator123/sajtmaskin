import { describe, expect, it } from "vitest";
import {
  readTestimonialItemsDraft,
  updateTestimonialItemsDraft,
  type TestimonialItemDraft,
} from "./testimonials-editor";

describe("testimonials-editor", () => {
  describe("readTestimonialItemsDraft", () => {
    it("reads name, role, quote from page files", () => {
      const content = [
        "const testimonials = [",
        "  { name: 'Anna', role: 'VD', quote: 'Fantastisk.' },",
        "  { name: 'Erik', role: 'CTO', quote: 'Mycket nöjd.' },",
        "];",
      ].join("\n");
      expect(readTestimonialItemsDraft("app/page.tsx", content)).toEqual([
        { name: "Anna", role: "VD", quote: "Fantastisk." },
        { name: "Erik", role: "CTO", quote: "Mycket nöjd." },
      ]);
    });

    it("returns null for non-page files", () => {
      const content = [
        "const testimonials = [",
        "  { name: 'A', role: 'R', quote: 'Q' },",
        "  { name: 'B', role: 'S', quote: 'P' },",
        "];",
      ].join("\n");
      expect(readTestimonialItemsDraft("components/testimonials.tsx", content)).toBeNull();
    });

    it("returns null when fewer than two items", () => {
      const content = [
        "const testimonials = [",
        "  { name: 'Anna', role: 'VD', quote: 'Fantastisk.' },",
        "];",
      ].join("\n");
      expect(readTestimonialItemsDraft("app/page.tsx", content)).toBeNull();
    });

    it("caps at 8 items", () => {
      const items = Array.from({ length: 10 }, (_, i) =>
        `  { name: 'N${i}', role: 'R${i}', quote: 'Q${i}' },`,
      ).join("\n");
      const content = `const testimonials = [\n${items}\n];`;
      const result = readTestimonialItemsDraft("app/page.tsx", content);
      expect(result).toHaveLength(8);
    });
  });

  describe("updateTestimonialItemsDraft", () => {
    it("updates name, role, quote in place", () => {
      const content = [
        "const testimonials = [",
        "  { name: 'Anna', role: 'VD', quote: 'Fantastisk.' },",
        "  { name: 'Erik', role: 'CTO', quote: 'Mycket nöjd.' },",
        "];",
      ].join("\n");
      const nextItems: TestimonialItemDraft[] = [
        { name: "Anna S", role: "VD", quote: "Fantastisk service." },
        { name: "Erik L", role: "CTO", quote: "Mycket nöjd med resultatet." },
      ];
      const updated = updateTestimonialItemsDraft(content, nextItems);
      expect(updated).toContain("name: 'Anna S'");
      expect(updated).toContain("quote: 'Fantastisk service.'");
      expect(updated).toContain("name: 'Erik L'");
      expect(updated).toContain("quote: 'Mycket nöjd med resultatet.'");
    });

    it("returns content unchanged when no edits", () => {
      const content = [
        "const testimonials = [",
        "  { name: 'A', role: 'R', quote: 'Q' },",
        "  { name: 'B', role: 'S', quote: 'P' },",
        "];",
      ].join("\n");
      const nextItems: TestimonialItemDraft[] = [
        { name: "A", role: "R", quote: "Q" },
        { name: "B", role: "S", quote: "P" },
      ];
      expect(updateTestimonialItemsDraft(content, nextItems)).toBe(content);
    });
  });
});
