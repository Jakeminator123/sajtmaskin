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

  it("aliases retired package ids to the 1 kr = 1 credit packs", () => {
    expect(getCreditPackageById("10_credits")).toMatchObject({
      id: "starter",
      credits: 49,
      price: 49,
    });
    expect(getCreditPackageById("25_credits")).toMatchObject({
      id: "popular",
      credits: 99,
      price: 99,
    });
    expect(getCreditPackageById("50_credits")).toMatchObject({
      id: "pro",
      credits: 179,
      price: 179,
    });
  });
});
