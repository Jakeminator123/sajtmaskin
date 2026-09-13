/**
 * Stripe checkout helpers.
 *
 * Paketpriserna ägs av `credit-packages.ts`. Den här filen lägger bara på
 * valfria Stripe price-id:n från server-env — importera den inte från klienten.
 */

import {
  CREDIT_PACKAGES,
  resolveCreditPackageId,
  type CreditPackageId,
} from "./credit-packages";

function normalizeStripePriceId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  // Only accept real Stripe price IDs; fallback pricing is used otherwise.
  if (!trimmed.startsWith("price_")) {
    return undefined;
  }
  return trimmed;
}

/** Valfria katalog-id:n. Medvetet osatta — checkout använder `price_data`. */
export const STRIPE_PRICE_ENV_KEYS = {
  starter: "STRIPE_PRICE_STARTER",
  popular: "STRIPE_PRICE_POPULAR",
  pro: "STRIPE_PRICE_PRO",
} as const satisfies Record<CreditPackageId, string>;

const STRIPE_PRICE_ENV = {
  starter: process.env.STRIPE_PRICE_STARTER,
  popular: process.env.STRIPE_PRICE_POPULAR,
  pro: process.env.STRIPE_PRICE_PRO,
} as const satisfies Record<CreditPackageId, string | undefined>;

const DIAMOND_PACKAGES = CREDIT_PACKAGES.map((pkg) => ({
  id: pkg.id,
  name: pkg.name,
  diamonds: pkg.credits,
  price: pkg.price,
  priceId: normalizeStripePriceId(STRIPE_PRICE_ENV[pkg.id]),
  popular: pkg.popular,
}));

export function getPackageById(id: string) {
  const canonical = resolveCreditPackageId(id);
  return canonical
    ? DIAMOND_PACKAGES.find((pkg) => pkg.id === canonical)
    : undefined;
}
