import { describe, expect, it } from "vitest";
import { CREDIT_PACKAGES } from "./credit-packages";
import { getPackageById, STRIPE_PRICE_ENV_KEYS } from "./stripe";

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

  it("resolves retired package ids to canonical checkout rows", () => {
    expect(getPackageById("25_credits")).toMatchObject({
      id: "popular",
      diamonds: 99,
      price: 99,
    });
  });

  it("names optional Stripe price env keys after the package ids", () => {
    expect(STRIPE_PRICE_ENV_KEYS).toEqual({
      starter: "STRIPE_PRICE_STARTER",
      popular: "STRIPE_PRICE_POPULAR",
      pro: "STRIPE_PRICE_PRO",
    });
  });
});
