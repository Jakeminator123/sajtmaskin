import { describe, expect, it } from "vitest";

import {
  applyMarkupSek,
  bindingQuoteFromSek,
  bindingQuoteFromUsd,
  customerPriceFromUsd,
  DEFAULT_DOMAIN_PRICING,
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

  it("seeds its defaults from the JSON reference data", () => {
    expect(DEFAULT_DOMAIN_PRICING.markup).toBe(DOMAIN_PRICE_MARKUP);
    expect(DEFAULT_DOMAIN_PRICING.usdToSek).toBe(USD_TO_SEK);
    // Ägarbeslut 2026-09-11: x2. Låst här så en tyst återgång till x5 syns.
    expect(DEFAULT_DOMAIN_PRICING.markup).toBe(2);
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

describe("operator-set pricing settings", () => {
  const adminSettings = { markup: 3, usdToSek: 9 };

  it("prices every surface from the resolved settings, not the JSON seed", () => {
    expect(applyMarkupSek(99, adminSettings)).toBe(297);
    expect(customerPriceFromUsd(10, adminSettings)).toBe(270);
    expect(fallbackCustomerPriceSek("se", adminSettings)).toBe(
      referenceWholesaleSek("se") * adminSettings.markup,
    );

    const quoted = bindingQuoteFromUsd(10, 1, adminSettings);
    expect(quoted.wholesaleSek).toBe(90);
    expect(quoted.customerSek).toBe(270);

    expect(bindingQuoteFromSek(100, 1, adminSettings).customerSek).toBe(300);
    expect(referenceQuote("se", adminSettings).customerSek).toBe(
      referenceWholesaleSek("se") * adminSettings.markup,
    );
  });

  it("changes the customer price when the admin markup changes", () => {
    const before = applyMarkupSek(99, { markup: 2, usdToSek: 11 });
    const after = applyMarkupSek(99, { markup: 7, usdToSek: 11 });
    expect(after).toBeGreaterThan(before);
    expect(after).toBe(693);
  });

  it("keeps the seeded defaults when no settings are passed", () => {
    expect(applyMarkupSek(99)).toBe(99 * DEFAULT_DOMAIN_PRICING.markup);
    expect(bindingQuoteFromUsd(10).wholesaleSek).toBe(10 * DEFAULT_DOMAIN_PRICING.usdToSek);
  });

  it("degrades a broken settings object to the defaults instead of NaN", () => {
    // A price surface must never render NaN kr because a row held garbage.
    for (const broken of [
      { markup: Number.NaN, usdToSek: Number.NaN },
      { markup: 0, usdToSek: 0 },
      { markup: -5, usdToSek: -11 },
      {},
      null,
    ]) {
      expect(applyMarkupSek(99, broken)).toBe(99 * DEFAULT_DOMAIN_PRICING.markup);
      expect(customerPriceFromUsd(10, broken)).toBe(
        Math.round(10 * DEFAULT_DOMAIN_PRICING.usdToSek * DEFAULT_DOMAIN_PRICING.markup),
      );
    }
  });
});
