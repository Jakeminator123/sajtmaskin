import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout";

export const metadata: Metadata = {
  title: "Användarvillkor",
  description: "Användarvillkor för Sajtmaskin – AI-driven webbplatsgenerering av Pretty Good AB.",
};

export default function TermsPage() {
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

        <h1 className="text-foreground mb-2 text-3xl font-semibold tracking-tight">
          Användarvillkor
        </h1>
        <p className="text-muted-foreground mb-10 text-sm">
          Senast uppdaterad: {new Date().toISOString().split("T")[0]}
        </p>

        <div className="prose-sm space-y-8">
          <Section title="1. Om tjänsten">
            <p>
              Sajtmaskin (&quot;Tjänsten&quot;) är en AI-driven plattform för webbplatsgenerering som
              drivs av Pretty Good AB, org.nr DG97 (&quot;Bolaget&quot;,
              &quot;vi&quot;). Genom att använda Tjänsten godkänner du dessa villkor.
            </p>
          </Section>

          <Section title="2. Användarkonto">
            <p>
              Du ansvarar för att hålla dina inloggningsuppgifter säkra. Du får inte dela ditt konto
              med andra. Vi förbehåller oss rätten att stänga konton som missbrukas.
            </p>
          </Section>

          <Section title="3. Credits och betalning">
            <p>
              Tjänsten använder ett credit-baserat system. Credits köps via Stripe och kan användas
              för att generera webbplatser och AI-funktioner. Köpta credits återbetalas inte om
              inget annat avtalas. Priserna anges inklusive moms om inget annat specificeras.
            </p>
          </Section>

          <Section title="4. Genererat innehåll">
            <p>
              Innehåll som genereras via Tjänsten baseras på AI-modeller. Du erhåller rätten att
              använda genererat innehåll fritt, inklusive kommersiellt. Vi garanterar inte att
              genererat innehåll är fritt från fel, immaterialrättsliga intrång eller säkerhetsbrister.
              Du ansvarar för att granska och anpassa genererat material innan publicering.
            </p>
          </Section>

          <Section title="5. Acceptabel användning">
            <p>Du förbinder dig att inte använda Tjänsten för att:</p>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-6 text-sm">
              <li>Generera olagligt, skadligt eller vilseledande innehåll</li>
              <li>Kränka tredje parts immaterialrättsliga rättigheter</li>
              <li>Överbelasta eller störa Tjänstens infrastruktur</li>
              <li>Automatisera åtkomst på sätt som inte stöds av Tjänsten</li>
            </ul>
          </Section>

          <Section title="6. Ansvarsbegränsning">
            <p>
              Tjänsten tillhandahålls &quot;i befintligt skick&quot;. Vi ansvarar inte för indirekta
              skador, utebliven vinst eller förlust av data. Vår maximala ansvarsskyldighet är
              begränsad till det belopp du betalat till oss under de senaste 12 månaderna.
            </p>
          </Section>

          <Section title="7. Ändringar av villkor">
            <p>
              Vi kan uppdatera dessa villkor med 30 dagars förvarning. Fortsatt användning efter
              uppdatering innebär godkännande av de nya villkoren.
            </p>
          </Section>

          <Section title="8. Tvistlösning">
            <p>
              Dessa villkor regleras av svensk lag. Tvister avgörs av svensk allmän domstol med
              Stockholms tingsrätt som första instans.
            </p>
          </Section>

          <Section title="9. Kontakt">
            <p>
              Pretty Good AB (DG97)
              <br />
              E-post:{" "}
              <a href="mailto:support@sajtmaskin.se" className="text-primary hover:underline">
                support@sajtmaskin.se
              </a>
              <br />
              Webb:{" "}
              <a
                href="https://sajtstudio.se"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                sajtstudio.se
              </a>
            </p>
          </Section>
        </div>
      </div>
    </main>
    <Footer />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-foreground mb-3 text-lg font-medium tracking-tight">{title}</h2>
      <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
