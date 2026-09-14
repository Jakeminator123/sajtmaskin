import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Download, MessageSquare, Sparkles } from "lucide-react";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  title: "Information om er kostnadsfria hemsida",
  description:
    "Erbjudandet till utvalda nystartade företag: en första hemsida, en uppföljning och nedladdning av koden. Från Pretty Good B.V.",
  robots: { index: false, follow: false },
};

const included = [
  {
    icon: Sparkles,
    title: "En första hemsida",
    text: "En kostnadsfri första generering utifrån er verksamhet och era önskemål.",
  },
  {
    icon: MessageSquare,
    title: "En uppföljning",
    text: "Beskriv vad ni vill ändra. En uppföljande generering av samma hemsida ingår.",
  },
  {
    icon: Download,
    title: "Koden att ta med",
    text: "Ladda ner hemsidans kod och arbeta vidare själva eller med en utvecklare.",
  },
];

export default function KostnadsfriInformationPage() {
  return (
    <>
      <main className="bg-background text-foreground min-h-screen">
        <div className="mx-auto max-w-5xl px-6 py-10 sm:py-16">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Sajtmaskin<span className="text-primary">.</span>
          </Link>

          <header className="max-w-3xl pt-14 pb-10 sm:pt-20">
            <p className="text-primary mb-5 text-xs font-medium tracking-widest uppercase">
              Till er som fått en inbjudan
            </p>
            <h1 className="text-4xl leading-tight font-(--font-heading) tracking-tight text-balance sm:text-5xl">
              En kostnadsfri hemsida till ert nystartade företag.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
              Ni får en start på webben. Vi får lära oss hur tjänsten fungerar för riktiga företag.
              Här förklarar vi vad som ingår och hur ni går vidare.
            </p>
            <p className="text-muted-foreground mt-5 text-sm">
              Inget köpkrav. Inget publiceras utan ert godkännande.
            </p>
          </header>

          <section aria-label="Det här ingår utan kostnad" className="grid gap-4 sm:grid-cols-3">
            {included.map(({ icon: Icon, title, text }) => (
              <div key={title} className="border-border/60 bg-card/50 rounded-2xl border p-6">
                <Icon aria-hidden="true" className="text-primary mb-5 h-6 w-6" />
                <h2 className="mb-3 text-lg font-medium">{title}</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </section>

          <div className="border-border/50 mt-14 grid gap-12 border-t pt-12 md:grid-cols-[1fr_2fr]">
            <aside className="text-muted-foreground text-sm leading-relaxed">
              <p className="text-foreground font-medium">Pretty Good B.V.</p>
              <p>Nederländerna</p>
              <p className="mt-4">Information uppdaterad 14 september 2026.</p>
              <a
                href="mailto:support@sajtmaskin.se"
                className="text-primary mt-5 inline-flex items-center gap-2 hover:underline"
              >
                Fråga oss om erbjudandet <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </a>
            </aside>

            <div className="space-y-10">
              <Section title="Varför gör vi detta?">
                <p>
                  Pretty Good B.V. är vårt nederländska ägarbolag bakom Sajtmaskin. Plattformen har
                  nått MVP-nivå: en första fungerande version som vi nu testar tillsammans med
                  kunder.
                </p>
                <p>
                  Vi väljer ut omkring hundra nystartade företag som får skapa en hemsida baserad på
                  sin verksamhetsbeskrivning. Vi vill förstå vad som fungerar bra, vad som är svårt
                  och vad vi behöver förbättra.
                </p>
                <p>
                  Vår egen uppskattning är att motsvarande manuella utvecklingsarbete kan vara värt
                  omkring 10 000 kronor eller mer, beroende på omfattningen. Det är en uppskattning,
                  inte en oberoende värdering.
                </p>
              </Section>

              <Section title="Så kommer ni igång">
                <ol className="list-decimal space-y-3 pl-5">
                  <li>Öppna er personliga länk och ange koden från mejlet.</li>
                  <li>Kontrollera verksamhetsuppgifterna och beskriv hemsidan ni vill skapa.</li>
                  <li>Logga in eller skapa ett konto och generera ert första utkast.</li>
                  <li>Gör en uppföljande ändringsomgång och ladda ner koden om ni vill.</li>
                </ol>
                <p>
                  Erbjudandet omfattar en första generering (init) och en uppföljande generering
                  (follow-up) av samma hemsida per inbjudet företag. Det gäller även om ni redan har
                  ett konto. Att öppna länken igen ger inga nya gratisgenereringar.
                </p>
              </Section>

              <Section title="Om ni vill fortsätta">
                <p>
                  Under en begränsad testperiod erbjuder vi fortsatt generering till
                  självkostnadspris. Kontakta oss innan ni fortsätter med betalda genereringar så
                  bekräftar vi testvillkoren, priset och periodens slutdatum för ert konto.
                  Erbjudandet innebär ingen automatisk prenumeration.
                </p>
                <div className="border-border/60 overflow-x-auto rounded-xl border">
                  <table className="w-full text-left text-sm">
                    <caption className="text-muted-foreground px-4 py-3 text-left">
                      Preliminära kostnadsuppskattningar per generering, före eventuell moms.
                    </caption>
                    <thead className="bg-muted/40 text-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Nivå
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Uppskattad kostnad
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-border/50 divide-y">
                      <tr>
                        <th scope="row" className="px-4 py-3 font-normal">
                          Enkel
                        </th>
                        <td className="px-4 py-3">1–2 kr</td>
                      </tr>
                      <tr>
                        <th scope="row" className="px-4 py-3 font-normal">
                          Medel
                        </th>
                        <td className="px-4 py-3">Cirka 10 kr</td>
                      </tr>
                      <tr>
                        <th scope="row" className="px-4 py-3 font-normal">
                          Hög
                        </th>
                        <td className="px-4 py-3">15–20 kr</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p>
                  Kostnaderna är ännu inte exakt uppmätta och varierar med uppgiftens omfattning och
                  valt läge. Beloppen ovan är inte fasta priser. Slutligt pris och eventuell moms
                  bekräftas innan ni beställer.
                </p>
                <p>
                  Publicering, löpande hosting, domän och externa tjänster ingår inte i
                  gratisgenereringarna. Eventuella kostnader för dessa anges separat. Ni kan också
                  ta med koden och ordna publiceringen själva eller med en utvecklare.
                </p>
              </Section>

              <Section title="Support och återkoppling">
                <p>
                  Ni som deltar får extra hjälp och prioriterad support i mån av tid. Vi uppskattar
                  några rader om hur det gick, särskilt om ni väljer att fortsätta och stöter på
                  problem. Återkopplingen är frivillig.
                </p>
                <p>
                  Tjänsten är under utveckling och buggar kan förekomma. Granska därför hemsidans
                  texter, bilder och funktioner innan ni publicerar den.
                </p>
                <p>
                  Kontakta oss om något går fel. Vi försöker hjälpa er att lösa problemet. Om ett
                  fel hos oss orsakat en felaktig debitering försöker vi i största möjliga mån
                  återställa förbrukade credits eller återbetala avgiften för den berörda
                  genereringen.
                </p>
              </Section>

              <Section title="Hur länge finns hemsidan kvar?">
                <p>
                  Gästprojekt som inte är kopplade till ett konto kan rensas efter sju dagars
                  inaktivitet. Tomma gästutkast där ingen hemsida har skapats kan rensas redan efter
                  24 timmar. Rensningen sker när vi kör vår städning, inte nödvändigtvis exakt när
                  tidsgränsen passerats.
                </p>
                <p>
                  Projekt som är kopplade till ert konto omfattas inte av denna gästrensning.
                  Kontrollera att projektet finns under Mina projekt, eller ladda ner koden om ni
                  vill behålla en egen kopia. Inbjudans giltighet är separat från hur länge ett
                  skapat projekt sparas.
                </p>
              </Section>

              <Section title="Varför fick ni ett mejl?">
                <p>
                  Vi har uppmärksammat att ert företag är nystartat genom offentliga
                  företagskungörelser och valt att bjuda in er. Hur kontaktuppgifter och annan
                  information behandlas beskrivs i vår{" "}
                  <Link
                    href="/privacy#foretagsinbjudningar"
                    className="text-primary hover:underline"
                  >
                    integritetsinformation om företagsinbjudningar
                  </Link>
                  .
                </p>
                <p className="border-border/60 text-foreground rounded-xl border p-4">
                  Vill ni inte ha fler inbjudningar eller annan direktmarknadsföring från oss? Svara
                  ”nej tack” på mejlet eller kontakta support@sajtmaskin.se. Ni behöver inte ange
                  någon anledning.
                </p>
                <p>
                  Ni kan alltid svara på inbjudan om ni har frågor. Här finns också våra{" "}
                  <Link href="/terms" className="text-primary hover:underline">
                    användarvillkor
                  </Link>
                  .
                </p>
              </Section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-medium tracking-tight">{title}</h2>
      <div className="text-muted-foreground space-y-4 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
