import { describe, expect, it } from "vitest";
import { CREDIT_PACKAGES, getCreditPackageById } from "./credit-packages";

describe("CREDIT_PACKAGES", () => {
  it("owns the three one-time packages", () => {
    expect(CREDIT_PACKAGES.map((pkg) => [pkg.id, pkg.credits, pkg.price])).toEqual([
      ["10_credits", 10, 49],
      ["25_credits", 25, 99],
      ["50_credits", 50, 179],
    ]);
    expect(CREDIT_PACKAGES[0].id).toBe("10_credits");
  });

  it("looks up by id", () => {
    expect(getCreditPackageById("25_credits")?.popular).toBe(true);
    expect(getCreditPackageById("missing")).toBeUndefined();
  });
});
