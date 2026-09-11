import { describe, expect, it } from "vitest";
import { CREDIT_PACKAGES } from "./credit-packages";
import { getPackageById } from "./stripe";

describe("getPackageById", () => {
  it("mirrors catalog credits as diamonds for checkout", () => {
    for (const pkg of CREDIT_PACKAGES) {
      expect(getPackageById(pkg.id)).toMatchObject({
        id: pkg.id,
        name: pkg.name,
        diamonds: pkg.credits,
        price: pkg.price,
        popular: pkg.popular,
      });
    }
    expect(getPackageById("missing")).toBeUndefined();
  });
});
