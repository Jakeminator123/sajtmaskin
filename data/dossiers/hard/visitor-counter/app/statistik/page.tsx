import type { Metadata } from "next";

import { VisitorStats } from "../../components/visitor-stats";

// The owner's own numbers — keep the page out of search results.
export const metadata: Metadata = {
  title: "Besöksstatistik",
  robots: { index: false, follow: false },
};

/**
 * Standard statistics page shipped with the visitor counter. Deliberately
 * plain and identical across sites: the owner opens /statistik and sees how
 * many people visited today, in total and per day for the last two weeks.
 */
export default function StatistikPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Besöksstatistik</h1>
        <p className="mt-2 text-muted-foreground">
          Så många har besökt sajten. Siffrorna räknas utan cookies och sparar inget om
          enskilda besökare.
        </p>
      </header>
      <VisitorStats />
    </main>
  );
}
