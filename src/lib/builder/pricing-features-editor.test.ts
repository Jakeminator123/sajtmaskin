import { describe, expect, it } from "vitest";
import {
  readPricingFeatureCardsDraft,
  updatePricingFeatureCardsDraft,
  type PricingFeatureCardDraft,
} from "./pricing-features-editor";

describe("pricing-features-editor", () => {
  describe("readPricingFeatureCardsDraft", () => {
    it("reads pricing card feature arrays from page files", () => {
      const content = [
        "<PricingCard",
        '  name="Starter"',
        '  price="$29"',
        '  description="For small teams."',
        '  features={["A", "B", "C"]}',
        "/>",
        "<PricingCard",
        '  name="Growth"',
        '  price="$89"',
        '  description="For scaling teams."',
        '  features={["D", "E", "F"]}',
        "/>",
      ].join("\n");

      expect(readPricingFeatureCardsDraft("app/page.tsx", content)).toEqual([
        { name: "Starter", features: ["A", "B", "C"] },
        { name: "Growth", features: ["D", "E", "F"] },
      ]);
    });

    it("returns null for non-page files", () => {
      const content = [
        "<PricingCard",
        '  name="Starter"',
        '  features={["A", "B"]}',
        "/>",
        "<PricingCard",
        '  name="Growth"',
        '  features={["C", "D"]}',
        "/>",
      ].join("\n");

      expect(readPricingFeatureCardsDraft("components/pricing.tsx", content)).toBeNull();
    });

    it("returns null when fewer than two cards exist", () => {
      const content = [
        "<PricingCard",
        '  name="Starter"',
        '  features={["A", "B"]}',
        "/>",
      ].join("\n");

      expect(readPricingFeatureCardsDraft("app/page.tsx", content)).toBeNull();
    });
  });

  describe("updatePricingFeatureCardsDraft", () => {
    it("updates pricing feature strings in place", () => {
      const content = [
        "<PricingCard",
        '  name="Starter"',
        '  price="$29"',
        '  description="For small teams."',
        '  features={["A", "B", "C"]}',
        "/>",
        "<PricingCard",
        '  name="Growth"',
        '  price="$89"',
        '  description="For scaling teams."',
        '  features={["D", "E", "F"]}',
        "/>",
      ].join("\n");

      const nextItems: PricingFeatureCardDraft[] = [
        { name: "Starter", features: ["Core seats", "Weekly sync", "Email support"] },
        { name: "Growth", features: ["Unlimited projects", "Priority queue", "Advanced analytics"] },
      ];

      const updated = updatePricingFeatureCardsDraft(content, nextItems);
      expect(updated).toContain('"Core seats"');
      expect(updated).toContain('"Weekly sync"');
      expect(updated).toContain('"Email support"');
      expect(updated).toContain('"Unlimited projects"');
      expect(updated).toContain('"Priority queue"');
      expect(updated).toContain('"Advanced analytics"');
    });

    it("returns content unchanged when no edits exist", () => {
      const content = [
        "<PricingCard",
        '  name="Starter"',
        '  features={["A", "B"]}',
        "/>",
        "<PricingCard",
        '  name="Growth"',
        '  features={["C", "D"]}',
        "/>",
      ].join("\n");

      const nextItems: PricingFeatureCardDraft[] = [
        { name: "Starter", features: ["A", "B"] },
        { name: "Growth", features: ["C", "D"] },
      ];

      expect(updatePricingFeatureCardsDraft(content, nextItems)).toBe(content);
    });
  });
});
