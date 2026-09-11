import { describe, expect, it } from "vitest";
import { DEFAULT_CREDIT_ACTION_PRICES, getCreditCost } from "./pricing";
import { DEFAULT_DOMAIN_PRICING } from "@/lib/domains/pricing";
import {
  FALLBACK_PUBLIC_PRICING,
  parsePublicPricing,
  publicPricingToBreakdown,
  toPublicPricing,
} from "./public-pricing";

describe("toPublicPricing", () => {
  it("exposes only domain knobs and effective credit prices", () => {
    const publicPricing = toPublicPricing({
      domain: { markup: 7, usdToSek: 9.5 },
      creditActionPrices: { wizard: 14, promptCreate: { premium: 12 } },
    });
    expect(publicPricing).toEqual({
      domain: { markup: 7, usdToSek: 9.5 },
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
  });
});

describe("parsePublicPricing", () => {
  it("accepts a valid payload and ignores operator metadata", () => {
    const parsed = parsePublicPricing({
      success: true,
      domain: { markup: 5, usdToSek: 11 },
      credits: DEFAULT_CREDIT_ACTION_PRICES,
      updatedBy: "admin_1",
      updatedAt: "2026-09-11T00:00:00.000Z",
    });
    expect(parsed).toEqual({
      domain: { markup: 5, usdToSek: 11 },
      credits: DEFAULT_CREDIT_ACTION_PRICES,
    });
  });

  it("rejects a truncated credit list so the UI can fall back", () => {
    expect(
      parsePublicPricing({
        domain: { markup: 5, usdToSek: 11 },
        credits: { wizard: 11 },
      }),
    ).toBeNull();
  });
});

describe("FALLBACK_PUBLIC_PRICING", () => {
  it("matches today's code constants", () => {
    expect(FALLBACK_PUBLIC_PRICING.domain).toEqual(DEFAULT_DOMAIN_PRICING);
    expect(FALLBACK_PUBLIC_PRICING.credits).toEqual(DEFAULT_CREDIT_ACTION_PRICES);
    expect(publicPricingToBreakdown(FALLBACK_PUBLIC_PRICING).deploy).toBe(
      getCreditCost("deploy.production"),
    );
  });
});
