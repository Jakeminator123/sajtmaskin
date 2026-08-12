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
      <main className="bg-background text-foreground min-h-screen">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground mb-8 inline-block text-sm transition-colors"
          >
            &larr; Tillbaka
          </Link>

          <h1 className="mb-2 text-3xl font-(--font-heading) tracking-tight">Blogg</h1>
          <p className="text-muted-foreground mb-10 text-sm">
            Här publicerar vi artiklar om produktnyheter, webb bästa praxis och exempel från
            verkligheten när innehållet finns på plats.
          </p>

          <div className="border-border/25 bg-card/30 text-muted-foreground rounded-2xl border p-8 text-sm leading-relaxed">
            <p className="text-foreground mb-4 font-medium">Inga inlägg ännu</p>
            <p className="mb-6">
              Vill du komma igång med en sajt under tiden? Öppna byggaren och beskriv ditt företag —
              första utkastet tar bara några sekunder.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/builder?new=1"
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                Öppna builder
              </Link>
              <Link
                href="/faq"
                className="border-border/40 text-foreground hover:bg-muted/50 inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
              >
                Vanliga frågor
              </Link>
            </div>
          </div>

          <div className="prose-sm text-muted-foreground mt-12 space-y-8">
            <section className="space-y-3 text-sm leading-relaxed">
              <h2 className="text-foreground text-lg font-medium">Planerade teman</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>Produktnyheter och releaseanteckningar</li>
                <li>Guider för snabbare sajtlansering och innehåll</li>
                <li>Exempel och lärdomar från svenska företag (när vi kan dela dem)</li>
              </ul>
            </section>
            <section className="space-y-3 text-sm leading-relaxed">
              <h2 className="text-foreground text-lg font-medium">Mer att läsa</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <Link href="/om" className="text-primary underline-offset-4 hover:underline">
                    Om Sajtmaskin
                  </Link>
                </li>
                <li>
                  <Link
                    href="/templates"
                    className="text-primary underline-offset-4 hover:underline"
                  >
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
