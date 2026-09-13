import { describe, expect, it } from "vitest";
import { CREDIT_PACKAGES, getCreditPackageById } from "./credit-packages";

describe("CREDIT_PACKAGES", () => {
  it("owns the three one-time packages at 1 kr = 1 credit", () => {
    expect(CREDIT_PACKAGES.map((pkg) => [pkg.id, pkg.credits, pkg.price])).toEqual([
      ["starter", 49, 49],
      ["popular", 99, 99],
      ["pro", 179, 179],
    ]);
    expect(CREDIT_PACKAGES[1]?.popular).toBe(true);
  });

  it("keeps credits identical to the kronor price", () => {
    for (const pkg of CREDIT_PACKAGES) {
      expect(pkg.credits).toBe(pkg.price);
      expect(pkg.savings).toBe(0);
    }
  });

  it("looks up by id", () => {
    expect(getCreditPackageById("popular")?.popular).toBe(true);
    expect(getCreditPackageById("missing")).toBeUndefined();
  });
});
