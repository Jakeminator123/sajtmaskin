/**
 * Stripe Configuration and Utilities
 *
 * Diamond packages and Stripe checkout helpers.
 */

// Diamond packages available for purchase
export const DIAMOND_PACKAGES = [
  {
    id: "10_diamonds",
    name: "10 Diamanter",
    diamonds: 10,
    price: 49, // SEK
    priceId: process.env.STRIPE_PRICE_10_DIAMONDS, // Stripe Price ID
    popular: false,
  },
  {
    id: "25_diamonds",
    name: "25 Diamanter",
    diamonds: 25,
    price: 99, // SEK
    priceId: process.env.STRIPE_PRICE_25_DIAMONDS,
    popular: true,
  },
  {
    id: "50_diamonds",
    name: "50 Diamanter",
    diamonds: 50,
    price: 179, // SEK
    priceId: process.env.STRIPE_PRICE_50_DIAMONDS,
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

// Calculate savings percentage
export function getSavingsPercent(packageData: (typeof DIAMOND_PACKAGES)[number]) {
  const basePrice = 49; // Price for 10 diamonds
  const baseDiamonds = 10;
  const pricePerDiamond = basePrice / baseDiamonds;
  const actualPricePerDiamond = packageData.price / packageData.diamonds;
  const savings = ((pricePerDiamond - actualPricePerDiamond) / pricePerDiamond) * 100;
  return Math.round(savings);
}
