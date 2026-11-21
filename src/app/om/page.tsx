import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { publicPageAlternates } from "@/lib/public-canonical-url";

export const metadata: Metadata = {
  title: "Om oss",
  description:
    "Sajtmaskin är en svensk AI-hemsidebyggare för småföretag: beskriv verksamheten, granska utkastet och publicera. Drivs av Pretty Good B.V. i Nederländerna.",
  alternates: publicPageAlternates("/om"),
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
            Sajtmaskin drivs av Pretty Good B.V. i Nederländerna och bygger professionella webbplatser med modern
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
              <h2 className="text-lg font-medium text-foreground">Så fungerar det</h2>
              <p>
                Du beskriver verksamheten med egna ord. Sajtmaskin tar fram en första version som
                riktig kod och visar den i en förhandsvisning. Sedan ändrar du texter, färger och
                sektioner genom att skriva vad du vill ha, och publicerar när uppgifterna stämmer.
                Hela flödet finns steg för steg på sidan{" "}
                <Link
                  href="/skapa-hemsida-med-ai"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Skapa hemsida med AI
                </Link>
                .
              </p>
            </section>
            <section className="space-y-3 text-sm leading-relaxed">
              <h2 className="text-lg font-medium text-foreground">Vem det passar</h2>
              <p>
                Sajtmaskin är byggt för småföretag och enskilda firmor som behöver en tydlig
                företagssida: vad ni gör, för vem, var ni finns och hur man når er. Behöver ni en stor
                butik eller tunga integrationer är en byrå eller kod från start ett ärligare val.
              </p>
            </section>
            <section className="space-y-3 text-sm leading-relaxed">
              <h2 className="text-lg font-medium text-foreground">Pris och ägande</h2>
              <p>
                Du betalar med credits som köps en gång, utan prenumeration eller bindningstid.
                Aktuella paket står på{" "}
                <Link href="/priser" className="text-primary underline-offset-4 hover:underline">
                  prissidan
                </Link>
                . Som inloggad ägare kan du ladda ner projektet som ZIP eller exportera det till
                GitHub. Med följer den genererade koden, inte databas, API-nycklar eller domän.
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
                  <Link
                    href="/skapa-hemsida"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Skapa hemsida
                  </Link>
                </li>
                <li>
                  <Link
                    href="/hemsida-till-foretag"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Hemsida till företag
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
