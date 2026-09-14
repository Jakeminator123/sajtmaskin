import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  title: "Integritetspolicy",
  description:
    "Integritetspolicy för Sajtmaskin – hur vi hanterar dina personuppgifter. Pretty Good B.V.",
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
          <p className="text-muted-foreground mb-10 text-sm">Senast uppdaterad: 2026-09-14</p>

          <div className="prose-sm space-y-8">
            <Section title="1. Personuppgiftsansvarig">
              <p>
                Pretty Good B.V., Nederländerna (&quot;vi&quot;, &quot;oss&quot;), är
                personuppgiftsansvarig för behandlingen av dina personuppgifter i samband med
                Sajtmaskin och våra företagsinbjudningar.
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
                  <strong className="text-foreground">Betalningsuppgifter:</strong> Hanteras av
                  Stripe – vi lagrar inte kortnummer
                </li>
                <li>
                  <strong className="text-foreground">Användningsdata:</strong> Sidvisningar,
                  funktionsanvändning, genererade projekt
                </li>
                <li>
                  <strong className="text-foreground">Teknisk data:</strong> IP-adress, webbläsare,
                  enhet (via cookies och analysverktyg)
                </li>
                <li>
                  <strong className="text-foreground">Företagsinbjudningar:</strong> Företags- och
                  kontaktuppgifter från offentliga kungörelser, uppgifter som ni lämnar själva samt
                  er kommunikation med oss. Se avsnittet om företagsinbjudningar nedan.
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

            <Section title="3a. Inbjudningar till nystartade företag" id="foretagsinbjudningar">
              <p>
                Vi väljer ut nystartade företag för att erbjuda ett kostnadsfritt test av
                Sajtmaskin. Urvalet utgår från Bolagsverkets offentliga kungörelser i Post- och
                Inrikes Tidningar. Att en uppgift är offentlig innebär inte att den saknar skydd
                enligt GDPR.
              </p>
              <p>
                Underlaget kan innehålla företagsnamn, organisationsnummer, verksamhetsbeskrivning,
                registreringsdatum, adress, e-post samt namn och roller för företrädare.
                Kungörelsernas råunderlag kan även innehålla personnummer och företrädares privata
                adress. Dessa uppgifter ska inte användas i inbjudningstexten eller på den
                genererade hemsidan.
              </p>
              <p>
                Vi använder relevanta företags- och kontaktuppgifter för att välja mottagare,
                anpassa inbjudan och förbereda verksamhetsuppgifter som ni kan kontrollera innan
                generering. Vi behandlar också svar, supportärenden och frivillig återkoppling. När
                ni använder er inbjudan registreras besök, verifiering och övergång till
                byggverktyget, tillsammans med tekniska sessionsuppgifter, för att följa testets
                användning.
              </p>
              <p>
                För urval och relevant företagskontakt är den rättsliga grunden intresseavvägning
                enligt artikel 6.1 f i GDPR. Vårt intresse är att presentera och utvärdera en tjänst
                som kan vara relevant för nystartade företag. Kontakten ska begränsas till vad som
                är motiverat i relation till mottagarens integritet och rimliga förväntningar. Ett
                offentligt registerfynd är inte ett samtycke till marknadsföring.
              </p>
              <p>
                OpenAI kan användas för att formulera inbjudans hälsning och text utifrån utvalda
                företagsuppgifter. Tjänsteleverantörerna i avsnitt 4 kan i övrigt behandla uppgifter
                som behövs för lagring, e-post, analys och den tjänst ni väljer att använda.
                Kontakta oss om ni vill veta vilka uppgifter och vilken källa som användes för just
                er inbjudan.
              </p>
              <p>
                Urvals- och kontaktuppgifter behålls medan de behövs för den aktuella inbjudan,
                pågående dialog och utvärdering av testet. När detta är avslutat och ingen
                kundrelation eller annan grund för fortsatt lagring finns ska uppgifterna raderas
                eller anonymiseras. Sjudagarsregeln för gästprojekt innebär inte att alla
                kontaktuppgifter och mejl raderas efter sju dagar.
              </p>
              <p className="border-border text-foreground rounded-lg border p-4">
                Du kan när som helst säga nej till direktmarknadsföring. Svara ”nej tack” på
                inbjudan eller mejla support@sajtmaskin.se. Vi slutar då använda dina uppgifter för
                det ändamålet. Vi kan behålla en begränsad spärrnotering med adressen och din
                invändning för att undvika att kontakta dig igen. Du behöver inte ange något skäl.
              </p>
              <p>
                Återkoppling på testet är frivillig. Att skapa ett konto eller prova tjänsten
                innebär inte att du anmäler dig till ett nyhetsbrev.
              </p>
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
                  <strong className="text-foreground">OpenAI och Anthropic</strong> – AI-bearbetning
                  i Sajtmaskins egen genereringsmotor
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
                <li>Begära begränsning av behandlingen</li>
                <li>Begära dataportabilitet</li>
                <li>Invända mot behandling</li>
                <li>Lämna klagomål till Integritetsskyddsmyndigheten (IMY)</li>
              </ul>
              <p>
                Vilka rättigheter som kan användas beror på behandlingen och dess rättsliga grund.
                Du kan också vända dig till tillsynsmyndigheten där du bor eller arbetar, eller till
                nederländska Autoriteit Persoonsgegevens. Om en behandling bygger på samtycke kan du
                återkalla det.
              </p>
            </Section>

            <Section title="7. Lagring och säkerhet">
              <p>
                Sajtmaskins produktionsdatabas hos Supabase är konfigurerad i regionen us-east-1 i
                USA. Andra leverantörer kan behandla eller lagra uppgifter i andra regioner beroende
                på tjänst och konfiguration. För integrationer som du ansluter till en genererad
                sajt styrs lagringsregionen av den leverantör och konfiguration som du väljer.
              </p>
              <p>
                Åtkomst till produktionsdata styrs med behörighetskontroller. Vi begränsar de
                uppgifter som skickas till en leverantör till vad den aktuella funktionen behöver.
              </p>
              <p>
                Gästprojekt som inte är kopplade till ett konto kan rensas efter sju dagars
                inaktivitet. Tomma gästutkast utan skapad hemsida kan rensas efter 24 timmar.
                Rensningen sker när städningen körs. Projekt som är kopplade till ett konto omfattas
                inte av denna gästrensning. Kontakta oss om du vill begära radering av ditt konto
                eller dina projekt; vissa uppgifter kan behöva behållas för exempelvis bokföring
                eller hantering av rättsliga anspråk.
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
                Pretty Good B.V.
                <br />
                Nederländerna
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
