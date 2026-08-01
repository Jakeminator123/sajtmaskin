/**
 * Domain pricing — markup, currency and the binding/estimated distinction
 * =======================================================================
 *
 * Single source of truth for what a customer is shown, and — more importantly
 * — for whether that number is something we may actually charge.
 *
 * Two kinds of price exist and they must never look the same:
 *
 *   - **binding** (`source: "registrar"`): a registrar quoted THIS domain just
 *     now. It is the only kind a purchase may be charged against.
 *   - **estimated** (`source: "reference"`): a per-TLD reference figure from
 *     `config/domain-pricing.json`. Fine for "ungefär vad kostar en .se?",
 *     never fine as the basis for a card charge.
 *
 * Before this split the search surface rendered both as a bare number, so a
 * `.se` always showed the same reference price even when Loopia was reachable
 * (Loopia's availability call returns no price at all) and a Vercel outage
 * silently swapped a real quote for a table lookup. Same font, same styling,
 * completely different epistemic status. `binding` is what closes that.
 *
 * Reference data (markup, USD→SEK, per-TLD figures) lives in
 * `config/domain-pricing.json` so the arbitrary numbers sit in one reviewable
 * place with a date on them, instead of being scattered across route files.
 */

import pricingConfig from "@/../config/domain-pricing.json";

/**
 * Customer markup multiplier applied on top of registrar wholesale.
 * Owner-set; change it in `config/domain-pricing.json`, not here.
 */
export const DOMAIN_PRICE_MARKUP: number = pricingConfig.markup;

/**
 * Fixed reference rate, not a live FX feed. Only ever used to render a
 * registrar's USD quote as SEK — the amount actually charged is the SEK
 * figure frozen into the order row at checkout.
 */
export const USD_TO_SEK: number = pricingConfig.usdToSek.rate;

/** Per-TLD reference wholesale in SEK/year. NOT quotes — see module docstring. */
export const REFERENCE_WHOLESALE_SEK: Readonly<Record<string, number>> =
  pricingConfig.referenceWholesaleSek;

const REFERENCE_FALLBACK_SEK: number = pricingConfig.referenceWholesaleFallbackSek;

/** Where a price came from, which decides whether it may be charged. */
export type DomainPriceSource = "registrar" | "reference" | "unknown";

export interface DomainPriceQuote {
  /** Customer-facing price in whole SEK, or `null` when nothing can be quoted. */
  customerSek: number | null;
  /** Wholesale the markup was applied to, in whole SEK. `null` when unknown. */
  wholesaleSek: number | null;
  currency: "SEK";
  source: DomainPriceSource;
  /**
   * `true` only for a live registrar quote for this exact domain. The purchase
   * path requires it; every other surface must label a `false` as an estimate.
   */
  binding: boolean;
  /** Registration period the quote covers, when the registrar reports one. */
  periodYears: number | null;
}

/** Apply the customer-facing markup and round to whole SEK. */
export function applyMarkupSek(wholesaleSek: number): number {
  if (!Number.isFinite(wholesaleSek) || wholesaleSek <= 0) return 0;
  return Math.round(wholesaleSek * DOMAIN_PRICE_MARKUP);
}

/** Convert wholesale USD → customer SEK with markup applied. */
export function customerPriceFromUsd(wholesaleUsd: number): number {
  return applyMarkupSek(wholesaleUsd * USD_TO_SEK);
}

/** Reference wholesale for a TLD in SEK. Falls back to the configured default. */
export function referenceWholesaleSek(tld: string): number {
  return REFERENCE_WHOLESALE_SEK[tld.toLowerCase()] ?? REFERENCE_FALLBACK_SEK;
}

/** Estimated customer-facing reference price for a TLD (SEK). */
export function fallbackCustomerPriceSek(tld: string): number {
  return applyMarkupSek(referenceWholesaleSek(tld));
}

/**
 * A live registrar quote in USD (Vercel Registrar reports USD).
 *
 * Rejects non-positive / non-finite input by degrading to `unknown` rather
 * than inventing a 0 kr price: a registrar that answers `{ price: 0 }` has told
 * us it could not price the name, not that the name is free.
 */
export function bindingQuoteFromUsd(
  wholesaleUsd: number,
  periodYears: number | null = 1,
): DomainPriceQuote {
  if (!Number.isFinite(wholesaleUsd) || wholesaleUsd <= 0) return unknownQuote();
  const wholesaleSek = Math.round(wholesaleUsd * USD_TO_SEK);
  return {
    customerSek: applyMarkupSek(wholesaleSek),
    wholesaleSek,
    currency: "SEK",
    source: "registrar",
    binding: true,
    periodYears,
  };
}

/** A live registrar quote already denominated in SEK. */
export function bindingQuoteFromSek(
  wholesaleSek: number,
  periodYears: number | null = 1,
): DomainPriceQuote {
  if (!Number.isFinite(wholesaleSek) || wholesaleSek <= 0) return unknownQuote();
  const rounded = Math.round(wholesaleSek);
  return {
    customerSek: applyMarkupSek(rounded),
    wholesaleSek: rounded,
    currency: "SEK",
    source: "registrar",
    binding: true,
    periodYears,
  };
}

/** A per-TLD reference figure. Displayable, never chargeable. */
export function referenceQuote(tld: string): DomainPriceQuote {
  const wholesaleSek = referenceWholesaleSek(tld);
  return {
    customerSek: applyMarkupSek(wholesaleSek),
    wholesaleSek,
    currency: "SEK",
    source: "reference",
    binding: false,
    periodYears: 1,
  };
}

/** No price at all — the surface should say so instead of showing a number. */
export function unknownQuote(): DomainPriceQuote {
  return {
    customerSek: null,
    wholesaleSek: null,
    currency: "SEK",
    source: "unknown",
    binding: false,
    periodYears: null,
  };
}

/** Stripe works in minor units; SEK öre are integers. */
export function sekToOre(sek: number): number {
  return Math.round(sek * 100);
}
