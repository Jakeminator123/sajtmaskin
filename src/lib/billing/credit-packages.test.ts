import { describe, expect, it } from "vitest";
import {
  CREDIT_PACKAGES,
  creditPackageIdFromPurchaseDescription,
  creditPackageMeasurement,
  getCreditPackageById,
} from "./credit-packages";

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

  it("parses webhook purchase descriptions into pixel minor units", () => {
    expect(creditPackageIdFromPurchaseDescription("Köp: popular")).toBe("popular");
    expect(creditPackageIdFromPurchaseDescription("Köp: 10_credits")).toBe("10_credits");
    expect(creditPackageIdFromPurchaseDescription("refund")).toBeUndefined();
    expect(creditPackageMeasurement("popular")).toEqual({
      packageId: "popular",
      name: "Mellanpaket",
      amount: 9900,
      currency: "SEK",
    });
    expect(creditPackageMeasurement("10_credits")).toMatchObject({
      packageId: "starter",
      amount: 4900,
    });
    expect(creditPackageMeasurement("missing")).toBeNull();
  });
});
