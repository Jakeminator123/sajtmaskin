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

export function getCreditPackageById(id: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find((pkg) => pkg.id === id);
}
