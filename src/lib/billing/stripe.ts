/**
 * Stripe checkout helpers.
 *
 * Paketpriserna ägs av `credit-packages.ts`. Den här filen lägger bara på
 * valfria Stripe price-id:n från server-env — importera den inte från klienten.
 */

import { CREDIT_PACKAGES } from "./credit-packages";

function normalizeStripePriceId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  // Only accept real Stripe price IDs; fallback pricing is used otherwise.
  if (!trimmed.startsWith("price_")) {
    return undefined;
  }
  return trimmed;
}

const STRIPE_PRICE_ENV = {
  "10_credits": process.env.STRIPE_PRICE_10_CREDITS,
  "25_credits": process.env.STRIPE_PRICE_25_CREDITS,
  "50_credits": process.env.STRIPE_PRICE_50_CREDITS,
} as const;

const DIAMOND_PACKAGES = CREDIT_PACKAGES.map((pkg) => ({
  id: pkg.id,
  name: pkg.name,
  diamonds: pkg.credits,
  price: pkg.price,
  priceId: normalizeStripePriceId(STRIPE_PRICE_ENV[pkg.id]),
  popular: pkg.popular,
}));

export function getPackageById(id: string) {
  return DIAMOND_PACKAGES.find((p) => p.id === id);
}
