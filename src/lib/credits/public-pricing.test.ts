import { describe, expect, it } from "vitest";
import { DEFAULT_CREDIT_ACTION_PRICES, getCreditCost } from "./pricing";
import {
  FALLBACK_PUBLIC_PRICING,
  parsePublicPricing,
  publicPricingToBreakdown,
  toPublicPricing,
} from "./public-pricing";

function assertNoPublicMarkup(payload: unknown) {
  expect(payload).not.toHaveProperty("domain");
  expect(JSON.stringify(payload)).not.toContain("markup");
}

describe("toPublicPricing", () => {
  it("exposes only effective credit prices", () => {
    const publicPricing = toPublicPricing({
      creditActionPrices: { wizard: 14, promptCreate: { premium: 12 } },
    });
    expect(publicPricing).toEqual({
      credits: {
        ...DEFAULT_CREDIT_ACTION_PRICES,
        wizard: 14,
        promptCreate: {
          ...DEFAULT_CREDIT_ACTION_PRICES.promptCreate,
          premium: 12,
        },
      },
    });
    expect(publicPricing).not.toHaveProperty("updatedAt");
    expect(publicPricing).not.toHaveProperty("updatedBy");
    assertNoPublicMarkup(publicPricing);
  });

  it("drops leftover domain knobs so markup never leaves the mapper", () => {
    const settings = {
      domain: { markup: 7, usdToSek: 9.5 },
      creditActionPrices: {},
    };
    const publicPricing = toPublicPricing(settings);
    assertNoPublicMarkup(publicPricing);
  });
});

describe("parsePublicPricing", () => {
  it("accepts a valid payload and ignores operator metadata", () => {
    const parsed = parsePublicPricing({
      success: true,
      credits: DEFAULT_CREDIT_ACTION_PRICES,
      updatedBy: "admin_1",
      updatedAt: "2026-09-11T00:00:00.000Z",
    });
    expect(parsed).toEqual({
      credits: DEFAULT_CREDIT_ACTION_PRICES,
    });
    assertNoPublicMarkup(parsed);
  });

  it("strips a leaked domain object instead of passing markup through", () => {
    const parsed = parsePublicPricing({
      domain: { markup: 5, usdToSek: 11 },
      credits: DEFAULT_CREDIT_ACTION_PRICES,
    });
    expect(parsed).toEqual({ credits: DEFAULT_CREDIT_ACTION_PRICES });
    assertNoPublicMarkup(parsed);
  });

  it("rejects a truncated credit list so the UI can fall back", () => {
    expect(
      parsePublicPricing({
        credits: { wizard: 11 },
      }),
    ).toBeNull();
  });
});

describe("FALLBACK_PUBLIC_PRICING", () => {
  it("matches today's code constants and never carries markup", () => {
    expect(FALLBACK_PUBLIC_PRICING.credits).toEqual(DEFAULT_CREDIT_ACTION_PRICES);
    expect(publicPricingToBreakdown(FALLBACK_PUBLIC_PRICING).deploy).toBe(
      getCreditCost("deploy.production"),
    );
    assertNoPublicMarkup(FALLBACK_PUBLIC_PRICING);
  });
});
