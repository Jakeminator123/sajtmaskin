/**
 * Publika creditpaket — kanonisk ägare av id, storlek och pris.
 *
 * 1 kr = 1 credit. Ingen env, ingen Stripe-klient, inga sidoeffekter.
 * Klientkomponenter får importera den här filen. Stripe price-id:n
 * kopplas på i `stripe.ts`.
 */

export const CREDIT_PACKAGES = [
  {
    id: "starter",
    name: "Starter",
    credits: 49,
    price: 49,
    popular: false,
    savings: 0,
  },
  {
    id: "popular",
    name: "Popular",
    credits: 99,
    price: 99,
    popular: true,
    savings: 0,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 179,
    price: 179,
    popular: false,
    savings: 0,
  },
] as const;

export type CreditPackage = (typeof CREDIT_PACKAGES)[number];
export type CreditPackageId = CreditPackage["id"];

/** Gamla checkout-id:n före 1 kr = 1 credit. Mappar till samma kronor/credits. */
export const LEGACY_CREDIT_PACKAGE_IDS = {
  "10_credits": "starter",
  "25_credits": "popular",
  "50_credits": "pro",
} as const satisfies Record<string, CreditPackageId>;

export function resolveCreditPackageId(id: string): CreditPackageId | undefined {
  if (CREDIT_PACKAGES.some((pkg) => pkg.id === id)) {
    return id as CreditPackageId;
  }
  return LEGACY_CREDIT_PACKAGE_IDS[id as keyof typeof LEGACY_CREDIT_PACKAGE_IDS];
}

export function getCreditPackageById(id: string): CreditPackage | undefined {
  const canonical = resolveCreditPackageId(id);
  return canonical
    ? CREDIT_PACKAGES.find((pkg) => pkg.id === canonical)
    : undefined;
}
