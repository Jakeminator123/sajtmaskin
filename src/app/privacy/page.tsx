import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";

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
          Senast uppdaterad: 2026-09-09
        </p>

        <div className="prose-sm space-y-8">
          <Section title="1. Personuppgiftsansvarig">
            <p>
              Pretty Good AB (&quot;vi&quot;, &quot;oss&quot;) är personuppgiftsansvarig för
              behandlingen av dina personuppgifter i samband med användningen av Sajtmaskin.
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
            <p>
              Beroende på vilka funktioner du använder kan uppgifter behandlas av följande
              leverantörer:
            </p>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-6 text-sm">
              <li>
                <strong className="text-foreground">Stripe</strong> – betalningshantering
              </li>
              <li>
                <strong className="text-foreground">Supabase</strong> – databas för konton,
                projekt och tjänstedata
              </li>
              <li>
                <strong className="text-foreground">Vercel</strong> – hosting, deployment,
                fillagring samt webb- och prestandaanalys
              </li>
              <li>
                <strong className="text-foreground">Google OAuth</strong> – inloggning (valfritt)
              </li>
              <li>
                <strong className="text-foreground">GitHub OAuth</strong> – inloggning och
                repo-import (valfritt)
              </li>
              <li>
                <strong className="text-foreground">OpenAI och Anthropic</strong> –
                AI-bearbetning i Sajtmaskins egen genereringsmotor
              </li>
              <li>
                <strong className="text-foreground">Upstash</strong> – hastighetsbegränsning och
                cache när tjänsten är konfigurerad för det
              </li>
              <li>
                <strong className="text-foreground">Resend</strong> – e-postleverans när en
                e-postfunktion används
              </li>
              <li>
                <strong className="text-foreground">D-ID</strong> – avatarfunktion när den är
                aktiverad
              </li>
            </ul>
          </Section>

          <Section title="5. Cookies" id="cookies">
            <p>Vi använder cookies och lokal lagring för:</p>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-6 text-sm">
              <li>
                <strong className="text-foreground">Nödvändiga cookies:</strong> Sessionshantering
                och autentisering
              </li>
              <li>
                <strong className="text-foreground">Lokal lagring:</strong> Spara valet du gör i
                cookie-bannern på din enhet
              </li>
              <li>
                <strong className="text-foreground">Trafik- och prestandamätning:</strong> Samlas
                in genom Sajtmaskins egen analys samt Vercel Analytics och Speed Insights
              </li>
            </ul>
            <p>Du kan hantera dina cookieinställningar via vår cookie-banner.</p>
          </Section>

          <Section title="6. Dina rättigheter (GDPR)" id="gdpr">
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
              Sajtmaskins produktionsdatabas hos Supabase är konfigurerad i regionen us-east-1 i
              USA. Andra leverantörer kan behandla eller lagra uppgifter i andra regioner beroende
              på tjänst och konfiguration. För integrationer som du ansluter till en genererad sajt
              styrs lagringsregionen av den leverantör och konfiguration som du väljer.
            </p>
            <p>
              Åtkomst till produktionsdata styrs med behörighetskontroller. Vi begränsar de
              uppgifter som skickas till en leverantör till vad den aktuella funktionen behöver.
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
              Pretty Good AB
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

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={id ? "scroll-mt-24" : undefined}>
      <h2 className="text-foreground mb-3 text-lg font-medium tracking-tight">{title}</h2>
      <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
