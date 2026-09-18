import type { CreditPackageId } from "./credit-packages";

/** Marknadstext per paket. Pris och storlek ägs av `credit-packages.ts`. */
export const creditPackageCopy: Record<
  CreditPackageId,
  { description: string; features: readonly string[]; cta: string }
> = {
  starter: {
    description: "För att komma igång",
    features: [
      "Används när du bygger, ändrar eller publicerar",
      "Kostnaden beror på vad du gör",
      "Engångsköp — credits går inte ut",
    ],
    cta: "Köp Starter",
  },
  popular: {
    description: "Bästa balans för de flesta",
    features: [
      "Används när du bygger, ändrar eller publicerar",
      "Kostnaden beror på vad du gör",
      "Engångsköp — credits går inte ut",
    ],
    cta: "Köp Popular",
  },
  pro: {
    description: "För högre tempo och fler ändringar",
    features: [
      "Används när du bygger, ändrar eller publicerar",
      "Kostnaden beror på vad du gör",
      "Engångsköp — credits går inte ut",
    ],
    cta: "Köp Pro",
  },
};
