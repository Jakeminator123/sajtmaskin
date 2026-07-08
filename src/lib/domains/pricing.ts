/**
 * Domain pricing — shared markup + currency helpers
 * ==================================================
 *
 * Single source of truth for the markup applied on top of the wholesale
 * price returned by the registrar API (Vercel). The customer-facing price is
 * always rendered in SEK.
 *
 * Markup currently 5x — set explicitly so a single edit here propagates to
 * every domain pricing surface (`/api/domains/check`, `/api/vercel/domains/price`).
 */

export const DOMAIN_PRICE_MARKUP = 5;

export const USD_TO_SEK = 11;

/** Fallback wholesale costs in SEK when no registrar API can be reached. */
export const FALLBACK_VERCEL_COSTS_SEK: Record<string, number> = {
  com: 40,
  io: 133,
  app: 50,
  net: 40,
  dev: 50,
  co: 83,
  org: 40,
  se: 50,
};

/** Apply the customer-facing markup and round to whole SEK. */
export function applyMarkupSek(wholesaleSek: number): number {
  if (!Number.isFinite(wholesaleSek) || wholesaleSek <= 0) return 0;
  return Math.round(wholesaleSek * DOMAIN_PRICE_MARKUP);
}

/** Convert wholesale USD → customer SEK with markup applied. */
export function customerPriceFromUsd(wholesaleUsd: number): number {
  return applyMarkupSek(wholesaleUsd * USD_TO_SEK);
}

/** Estimated customer-facing fallback price for a given TLD (SEK). */
export function fallbackCustomerPriceSek(tld: string): number {
  const wholesale = FALLBACK_VERCEL_COSTS_SEK[tld.toLowerCase()] ?? 50;
  return applyMarkupSek(wholesale);
}
