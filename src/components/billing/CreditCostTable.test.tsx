import { describe, expect, it } from "vitest";
import { CREDIT_COST_BREAKDOWN } from "@/lib/credits/pricing";
import { CREDIT_PACKAGES } from "@/lib/billing/credit-packages";
import { smallestPackageExample } from "./CreditCostTable";

describe("smallestPackageExample", () => {
  it("describes what the smallest package covers with the default prices", () => {
    const text = smallestPackageExample(CREDIT_COST_BREAKDOWN);
    const pkg = CREDIT_PACKAGES[0];
    if (CREDIT_COST_BREAKDOWN.generatePro + CREDIT_COST_BREAKDOWN.deploy > pkg.credits) {
      expect(text).toBeNull();
      return;
    }
    expect(text).toContain(`${pkg.name} (${pkg.credits} credits)`);
    expect(text).toContain("en generering");
    expect(text).toContain("en publicering");
  });

  it("never promises more than the package holds", () => {
    expect(
      smallestPackageExample({ ...CREDIT_COST_BREAKDOWN, generatePro: 1_000 }),
    ).toBeNull();
    expect(smallestPackageExample({ ...CREDIT_COST_BREAKDOWN, refinePro: 0 })).toBeNull();
  });

  it("counts refinements left after one generation and one publish", () => {
    const text = smallestPackageExample({
      ...CREDIT_COST_BREAKDOWN,
      generatePro: 10,
      deploy: 9,
      refinePro: 5,
    });
    const refines = Math.floor((CREDIT_PACKAGES[0].credits - 19) / 5);
    expect(text).toContain(`${refines} förfiningar`);
  });
});
