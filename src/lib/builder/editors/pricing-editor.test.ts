import { describe, expect, it } from "vitest";
import {
  readPricingCardsDraft,
  updatePricingCardsDraft,
  type PricingCardDraft,
} from "./pricing-editor";

describe("pricing-editor", () => {
  describe("readPricingCardsDraft", () => {
    it("reads pricing cards from page files", () => {
      const content = [
        "<PricingCard",
        '  name="Starter"',
        '  price="$29"',
        '  description="For small teams."',
        "  features={['A']}",
        "/>",
        "<PricingCard",
        '  name="Growth"',
        '  price="$89"',
        '  description="For scaling teams."',
        "  features={['B']}",
        "/>",
      ].join("\n");

      expect(readPricingCardsDraft("app/page.tsx", content)).toEqual([
        { name: "Starter", price: "$29", description: "For small teams." },
        { name: "Growth", price: "$89", description: "For scaling teams." },
      ]);
    });

    it("returns null for non-page files", () => {
      const content = [
        "<PricingCard",
        '  name="Starter"',
        '  price="$29"',
        '  description="For small teams."',
        "/>",
        "<PricingCard",
        '  name="Growth"',
        '  price="$89"',
        '  description="For scaling teams."',
        "/>",
      ].join("\n");

      expect(readPricingCardsDraft("components/pricing.tsx", content)).toBeNull();
    });

    it("returns null when fewer than two cards exist", () => {
      const content = [
        "<PricingCard",
        '  name="Starter"',
        '  price="$29"',
        '  description="For small teams."',
        "/>",
      ].join("\n");

      expect(readPricingCardsDraft("app/page.tsx", content)).toBeNull();
    });
  });

  describe("updatePricingCardsDraft", () => {
    it("updates name, price, and description in place", () => {
      const content = [
        "<PricingCard",
        '  name="Starter"',
        '  price="$29"',
        '  description="For small teams."',
        "/>",
        "<PricingCard",
        '  name="Growth"',
        '  price="$89"',
        '  description="For scaling teams."',
        "/>",
      ].join("\n");

      const nextItems: PricingCardDraft[] = [
        {
          name: "Basic",
          price: "$39",
          description: "For lean teams getting started.",
        },
        {
          name: "Pro",
          price: "$99",
          description: "For teams expanding fast.",
        },
      ];

      const updated = updatePricingCardsDraft(content, nextItems);
      expect(updated).toContain('name="Basic"');
      expect(updated).toContain('price="$39"');
      expect(updated).toContain('description="For lean teams getting started."');
      expect(updated).toContain('name="Pro"');
      expect(updated).toContain('price="$99"');
      expect(updated).toContain('description="For teams expanding fast."');
    });

    it("returns content unchanged when no edits exist", () => {
      const content = [
        "<PricingCard",
        '  name="Starter"',
        '  price="$29"',
        '  description="For small teams."',
        "/>",
        "<PricingCard",
        '  name="Growth"',
        '  price="$89"',
        '  description="For scaling teams."',
        "/>",
      ].join("\n");

      const nextItems: PricingCardDraft[] = [
        { name: "Starter", price: "$29", description: "For small teams." },
        { name: "Growth", price: "$89", description: "For scaling teams." },
      ];

      expect(updatePricingCardsDraft(content, nextItems)).toBe(content);
    });
  });
});
