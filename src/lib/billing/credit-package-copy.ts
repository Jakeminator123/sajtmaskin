import type { CreditPackageId } from "./credit-packages";

/** Marknadstext per paket. Pris och storlek ägs av `credit-packages.ts`. */
export const creditPackageCopy: Record<
  CreditPackageId,
  { description: string; features: readonly string[]; cta: string }
> = {
  starter: {
    description: "Perfekt för att testa",
    features: [
      "AI-generering & förfining",
      "Aldrig utgångsdatum",
      "Engångsköp - ingen prenumeration",
    ],
    cta: "Köp Starter",
  },
  popular: {
    description: "Bästa balans för de flesta",
    features: [
      "AI-generering & förfining",
      "Aldrig utgångsdatum",
      "Engångsköp - ingen prenumeration",
    ],
    cta: "Köp Popular",
  },
  pro: {
    description: "För högre tempo och fler iterationer",
    features: [
      "AI-generering & förfining",
      "Aldrig utgångsdatum",
      "Engångsköp - ingen prenumeration",
    ],
    cta: "Köp Pro",
  },
};
