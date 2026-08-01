import { describe, expect, it } from "vitest";

import {
  applyMarkupSek,
  bindingQuoteFromSek,
  bindingQuoteFromUsd,
  customerPriceFromUsd,
  DOMAIN_PRICE_MARKUP,
  fallbackCustomerPriceSek,
  referenceQuote,
  referenceWholesaleSek,
  sekToOre,
  unknownQuote,
  USD_TO_SEK,
} from "./pricing";

describe("domain pricing", () => {
  it("applies the configured markup and rounds to whole SEK", () => {
    expect(applyMarkupSek(99)).toBe(99 * DOMAIN_PRICE_MARKUP);
    expect(applyMarkupSek(10.4)).toBe(Math.round(10.4 * DOMAIN_PRICE_MARKUP));
  });

  it("treats a non-positive wholesale as no price rather than a free domain", () => {
    // A registrar answering `0` has failed to price the name; charging 0 kr for
    // it would be the worst possible reading of that response.
    expect(applyMarkupSek(0)).toBe(0);
    expect(applyMarkupSek(-5)).toBe(0);
    expect(applyMarkupSek(Number.NaN)).toBe(0);
    expect(bindingQuoteFromUsd(0).binding).toBe(false);
    expect(bindingQuoteFromUsd(0).source).toBe("unknown");
    expect(bindingQuoteFromSek(-1).customerSek).toBeNull();
  });

  it("marks a registrar quote as binding and a reference figure as not", () => {
    const quoted = bindingQuoteFromUsd(10, 1);
    expect(quoted.binding).toBe(true);
    expect(quoted.source).toBe("registrar");
    expect(quoted.wholesaleSek).toBe(10 * USD_TO_SEK);
    expect(quoted.customerSek).toBe(customerPriceFromUsd(10));

    const estimated = referenceQuote("se");
    expect(estimated.binding).toBe(false);
    expect(estimated.source).toBe("reference");
    expect(estimated.customerSek).toBe(fallbackCustomerPriceSek("se"));
  });

  it("never reports an unknown quote as chargeable", () => {
    const unknown = unknownQuote();
    expect(unknown.binding).toBe(false);
    expect(unknown.customerSek).toBeNull();
    expect(unknown.wholesaleSek).toBeNull();
  });

  it("falls back to the configured default for an unlisted TLD", () => {
    expect(referenceWholesaleSek("com")).toBeGreaterThan(0);
    // Not in the reference table — must still produce a usable estimate rather
    // than NaN leaking into a rendered price.
    expect(referenceWholesaleSek("zzz-not-a-real-tld")).toBeGreaterThan(0);
    expect(Number.isFinite(fallbackCustomerPriceSek("zzz-not-a-real-tld"))).toBe(true);
  });

  it("is case-insensitive about the TLD", () => {
    expect(referenceWholesaleSek("SE")).toBe(referenceWholesaleSek("se"));
  });

  it("converts SEK to integer öre for Stripe", () => {
    expect(sekToOre(495)).toBe(49_500);
    expect(sekToOre(0.5)).toBe(50);
    expect(Number.isInteger(sekToOre(123.456))).toBe(true);
  });
});
