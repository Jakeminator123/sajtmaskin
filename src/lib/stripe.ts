/**
 * Stripe Configuration and Utilities
 *
 * Credit packages and Stripe checkout helpers.
 * Popular package: 25 credits = 99 SEK (~4 kr/credit).
 */

function normalizeStripePriceId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  // Only accept real Stripe price IDs; fallback pricing is used otherwise.
  if (!trimmed.startsWith("price_")) {
    return undefined;
  }
  return trimmed;
}

// Credit packages available for purchase
export const DIAMOND_PACKAGES = [
  {
    id: "10_credits",
    name: "Starter",
    diamonds: 10,
    price: 49, // SEK (4.9 kr/credit)
    priceId: normalizeStripePriceId(process.env.STRIPE_PRICE_10_CREDITS), // Optional Stripe Price ID
    popular: false,
  },
  {
    id: "25_credits",
    name: "Popular",
    diamonds: 25,
    price: 99, // SEK (~4 kr/credit, ~19% off)
    priceId: normalizeStripePriceId(process.env.STRIPE_PRICE_25_CREDITS),
    popular: true,
  },
  {
    id: "50_credits",
    name: "Pro",
    diamonds: 50,
    price: 179, // SEK (~3.6 kr/credit, ~27% off)
    priceId: normalizeStripePriceId(process.env.STRIPE_PRICE_50_CREDITS),
    popular: false,
  },
] as const;

export type DiamondPackageId = (typeof DIAMOND_PACKAGES)[number]["id"];

// Get package by ID
export function getPackageById(id: string) {
  return DIAMOND_PACKAGES.find((p) => p.id === id);
}

// Get package by Stripe Price ID
export function getPackageByPriceId(priceId: string) {
  return DIAMOND_PACKAGES.find((p) => p.priceId === priceId);
}

// Calculate savings percentage vs base rate (starter package rate)
export function getSavingsPercent(packageData: (typeof DIAMOND_PACKAGES)[number]) {
  const baseRatePerCredit = 4.9; // Starter: 49/10 = 4.9 SEK per credit
  const actualPricePerCredit = packageData.price / packageData.diamonds;
  const savings = ((baseRatePerCredit - actualPricePerCredit) / baseRatePerCredit) * 100;
  return Math.round(savings);
}
