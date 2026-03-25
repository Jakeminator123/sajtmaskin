import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout";

export const metadata: Metadata = {
  title: "Om oss",
  description:
    "Om Sajtmaskin — AI-driven webbplattform för svenska företag. Pretty Good AB.",
};

export default function OmPage() {
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
            Om Sajtmaskin
          </h1>
          <p className="mb-10 text-sm text-muted-foreground">
            Sajtmaskin drivs av Pretty Good AB och bygger professionella webbplatser med modern
            stack (React, Next.js, TypeScript) och AI-assisterade arbetsflöden.
          </p>

          <div className="prose-sm space-y-8 text-muted-foreground">
            <section className="space-y-3 text-sm leading-relaxed">
              <h2 className="text-lg font-medium text-foreground">Vad vi gör</h2>
              <p>
                Vi hjälper företag att gå från idé till publicerad sajt snabbare — med tydlig
                struktur, bra prestanda och verktyg som följer svensk kontext och språk där det
                spelar roll.
              </p>
            </section>
            <section className="space-y-3 text-sm leading-relaxed">
              <h2 className="text-lg font-medium text-foreground">Kontakt</h2>
              <p>
                Frågor eller samarbete:{" "}
                <a
                  href="mailto:support@sajtmaskin.se"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  support@sajtmaskin.se
                </a>
              </p>
            </section>
            <section className="space-y-3 text-sm leading-relaxed">
              <h2 className="text-lg font-medium text-foreground">Mer att läsa</h2>
              <ul className="list-disc space-y-1 pl-5">
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
