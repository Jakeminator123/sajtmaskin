/**
 * Publika creditpaket — kanonisk ägare av id, storlek och pris.
 *
 * Ingen env, ingen Stripe-klient, inga sidoeffekter. Klientkomponenter
 * får importera den här filen. Stripe price-id:n kopplas på i `stripe.ts`.
 */

export const CREDIT_PACKAGES = [
  {
    id: "10_credits",
    name: "Starter",
    credits: 10,
    price: 49, // SEK (4.9 kr/credit)
    popular: false,
    savings: 0,
  },
  {
    id: "25_credits",
    name: "Popular",
    credits: 25,
    price: 99, // SEK (~4 kr/credit, ~19% off)
    popular: true,
    savings: 19,
  },
  {
    id: "50_credits",
    name: "Pro",
    credits: 50,
    price: 179, // SEK (~3.6 kr/credit, ~27% off)
    popular: false,
    savings: 27,
  },
] as const;

export type CreditPackage = (typeof CREDIT_PACKAGES)[number];
export type CreditPackageId = CreditPackage["id"];

export function getCreditPackageById(id: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find((pkg) => pkg.id === id);
}
