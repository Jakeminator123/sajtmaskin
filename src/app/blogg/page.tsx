import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  title: "Blogg",
  description:
    "Artiklar om Sajtmaskin, webb bästa praxis och produktnyheter — första inlägg publiceras när redaktionen är igång.",
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
            <p className="mb-4 font-medium text-foreground">Inga inlägg ännu</p>
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

          <div className="prose-sm mt-12 space-y-8 text-muted-foreground">
            <section className="space-y-3 text-sm leading-relaxed">
              <h2 className="text-lg font-medium text-foreground">Planerade teman</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>Produktnyheter och releaseanteckningar</li>
                <li>Guider för snabbare sajtlansering och innehåll</li>
                <li>Exempel och lärdomar från svenska företag (när vi kan dela dem)</li>
              </ul>
            </section>
            <section className="space-y-3 text-sm leading-relaxed">
              <h2 className="text-lg font-medium text-foreground">Mer att läsa</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <Link href="/om" className="text-primary underline-offset-4 hover:underline">
                    Om Sajtmaskin
                  </Link>
                </li>
                <li>
                  <Link href="/templates" className="text-primary underline-offset-4 hover:underline">
                    Mallar
                  </Link>
                </li>
                <li>
                  <Link href="/faq" className="text-primary underline-offset-4 hover:underline">
                    Vanliga frågor
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-primary underline-offset-4 hover:underline">
                    Integritetspolicy
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
