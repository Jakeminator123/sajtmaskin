import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout";

export const metadata: Metadata = {
  title: "Blogg",
  description: "Nyheter och tips från Sajtmaskin — kommer snart.",
};

export default function BloggPage() {
  return (
    <>
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <Link
            href="/"
            className="mb-8 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            &larr; Tillbaka
          </Link>

          <h1 className="mb-2 text-3xl font-(--font-heading) tracking-tight">
            Blogg
          </h1>
          <p className="mb-10 text-sm text-muted-foreground">
            Här publicerar vi artiklar om produktnyheter, webb bästa praxis och exempel från
            verkligheten när innehållet finns på plats.
          </p>

          <div className="rounded-2xl border border-border/25 bg-card/30 p-8 text-sm leading-relaxed text-muted-foreground">
            <p className="mb-4 text-foreground font-medium">Inga inlägg ännu</p>
            <p className="mb-6">
              Vill du komma igång med en sajt under tiden? Öppna byggaren och beskriv ditt
              företag — första utkastet tar bara några sekunder.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/builder"
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Öppna builder
              </Link>
              <Link
                href="/faq"
                className="inline-flex items-center rounded-lg border border-border/40 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
              >
                Vanliga frågor
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
