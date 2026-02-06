import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout";

export const metadata: Metadata = {
  title: "Integritetspolicy",
  description:
    "Integritetspolicy för Sajtmaskin – hur vi hanterar dina personuppgifter. Pretty Good AB.",
};

export default function PrivacyPage() {
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
          Integritetspolicy
        </h1>
        <p className="text-muted-foreground mb-10 text-sm">
          Senast uppdaterad: {new Date().toISOString().split("T")[0]}
        </p>

        <div className="prose-sm space-y-8">
          <Section title="1. Personuppgiftsansvarig">
            <p>
              Pretty Good AB, org.nr DG97 (&quot;vi&quot;, &quot;oss&quot;) är
              personuppgiftsansvarig för behandlingen av dina personuppgifter i samband med
              användningen av Sajtmaskin.
            </p>
            <p>
              Kontakt:{" "}
              <a href="mailto:support@sajtmaskin.se" className="text-primary hover:underline">
                support@sajtmaskin.se
              </a>
            </p>
          </Section>

          <Section title="2. Vilka uppgifter samlar vi in?">
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-6 text-sm">
              <li>
                <strong className="text-foreground">Kontoinformation:</strong> E-postadress, namn
                (vid registrering via Google/GitHub OAuth)
              </li>
              <li>
                <strong className="text-foreground">Betalningsuppgifter:</strong> Hanteras av Stripe
                – vi lagrar inte kortnummer
              </li>
              <li>
                <strong className="text-foreground">Användningsdata:</strong> Sidvisningar,
                funktionsanvändning, genererade projekt
              </li>
              <li>
                <strong className="text-foreground">Teknisk data:</strong> IP-adress, webbläsare,
                enhet (via cookies och analysverktyg)
              </li>
            </ul>
          </Section>

          <Section title="3. Hur använder vi dina uppgifter?">
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-6 text-sm">
              <li>Tillhandahålla och förbättra Tjänsten</li>
              <li>Hantera ditt konto och credits</li>
              <li>Bearbeta betalningar via Stripe</li>
              <li>Kommunicera om tjänsteändringar</li>
              <li>Analysera användningsmönster för produktutveckling</li>
            </ul>
          </Section>

          <Section title="4. Tredjepartstjänster">
            <p>Vi delar uppgifter med följande tredjeparter:</p>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-6 text-sm">
              <li>
                <strong className="text-foreground">Stripe</strong> – betalningshantering
              </li>
              <li>
                <strong className="text-foreground">Vercel</strong> – hosting och deployment
              </li>
              <li>
                <strong className="text-foreground">Google OAuth</strong> – inloggning (valfritt)
              </li>
              <li>
                <strong className="text-foreground">GitHub OAuth</strong> – inloggning och
                repo-import (valfritt)
              </li>
              <li>
                <strong className="text-foreground">AI-modeller</strong> (OpenAI/Anthropic via v0) –
                för generering av webbinnehåll
              </li>
            </ul>
          </Section>

          <Section title="5. Cookies">
            <p>Vi använder cookies för:</p>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-6 text-sm">
              <li>
                <strong className="text-foreground">Nödvändiga cookies:</strong> Sessionshantering
                och autentisering
              </li>
              <li>
                <strong className="text-foreground">Analyscookies:</strong> Anonymiserad
                användningsstatistik (med ditt samtycke)
              </li>
            </ul>
            <p>Du kan hantera dina cookieinställningar via vår cookie-banner.</p>
          </Section>

          <Section title="6. Dina rättigheter (GDPR)">
            <p>Du har rätt att:</p>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-6 text-sm">
              <li>Begära tillgång till dina personuppgifter</li>
              <li>Begära rättelse av felaktiga uppgifter</li>
              <li>Begära radering av dina uppgifter</li>
              <li>Begära dataportabilitet</li>
              <li>Invända mot behandling</li>
              <li>Lämna klagomål till Integritetsskyddsmyndigheten (IMY)</li>
            </ul>
          </Section>

          <Section title="7. Lagring och säkerhet">
            <p>
              Personuppgifter lagras inom EU/EES. Vi vidtar lämpliga tekniska och organisatoriska
              åtgärder för att skydda dina uppgifter, inklusive kryptering, åtkomstkontroll och
              regelbundna säkerhetsgranskningar.
            </p>
          </Section>

          <Section title="8. Ändringar">
            <p>
              Vi kan uppdatera denna policy. Väsentliga ändringar meddelas via e-post eller i
              Tjänsten. Senaste versionen finns alltid tillgänglig på denna sida.
            </p>
          </Section>

          <Section title="9. Kontakt">
            <p>
              Frågor om personuppgiftsbehandling:
              <br />
              Pretty Good AB (DG97)
              <br />
              E-post:{" "}
              <a href="mailto:support@sajtmaskin.se" className="text-primary hover:underline">
                support@sajtmaskin.se
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
