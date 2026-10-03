import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { LandingFooter } from "@/components/landing-v2/landing-footer";
import { SiteBackground } from "@/components/layout/site-background";
import { Button } from "@/components/ui/button";
import {
  getReadyRelatedSeoLandingSlugs,
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
  type SeoLandingSlug,
} from "@/lib/seo-landing-pages/registry";

const SLUG = "ai-hemsidebyggare" as const;

const DEFINITION_STEPS = [
  {
    title: "Beskriv",
    body: "Du skriver vad verksamheten gör, vem sidan är till och vad besökaren ska göra. Det är briefen, inte ett färdigt manus.",
  },
  {
    title: "Generera utkast",
    body: "Verktyget föreslår sektioner, layout och texter. I Sajtmaskin kommer utkastet som en riktig Next.js-sajt du öppnar i preview.",
  },
  {
    title: "Granska och publicera",
    body: "Du rättar fakta, byter bilder och styr nästa version med vanliga meningar. Publicering är ett separat steg — inte samma sak som preview.",
  },
] as const;

const CRITERIA = [
  {
    title: "Designkontroll",
    why: "Slippa börja om för små justeringar",
    ask: "Hur finkornig är redigeringen efter första utkastet?",
    sajtmaskin:
      "Du styr med följdtext i buildern. Det är inte en klassisk punkt-och-klicka-editor; du beskriver ändringen och granskar nästa version.",
  },
  {
    title: "Mobil",
    why: "De flesta besök kommer från telefon",
    ask: "Hur ser v1 ut på smal skärm med era egna bilder?",
    sajtmaskin:
      "Utkastet är en responsiv sajt. Titta i preview på smal bredd innan du publicerar, särskilt när bilderna byts ut.",
  },
  {
    title: "Redigering",
    why: "AI-utkast är start, inte slut",
    ask: "Kan en kollega ändra text utan att skriva om hela prompten?",
    sajtmaskin:
      "Ändringar går via samma builder-chatt, inte via ett separat CMS-konto. Den som har tillgång till projektet kan skicka följdinstruktioner. Det är inte samma sak som att ge en kollega en WordPress-inloggning.",
  },
  {
    title: "Export / ägarskap",
    why: "Exit-risk och långsiktighet",
    ask: "Vad kan exporteras — och vem äger filerna?",
    sajtmaskin:
      "Som inloggad ägare kan du ladda ner projektet som ZIP eller exportera till GitHub. Med följer den genererade koden, inte databasen, API-nycklar eller domänregistrering.",
  },
  {
    title: "Integrationer",
    why: "Bokning, mejl, analys, betalning",
    ask: "Vilka kopplingar finns på riktigt i produkten?",
    sajtmaskin:
      "Första versionen kan visa formulär och bokningsytor som utkast. Betalning, inloggning och andra integrationer är demo tills du uttryckligen bygger dem. Räkna inte med färdiga kopplingar från dag ett.",
  },
  {
    title: "SEO-grunder",
    why: "Titlar, rubriker, URL:er, hastighet",
    ask: "Kan ni styra title, meta och URL:er själva?",
    sajtmaskin:
      "Sajten är Next.js, så title och texter går att ändra i koden eller via följdinstruktioner. Det finns ingen separat SEO-panel att lita på som enda yta.",
  },
  {
    title: "Pris",
    why: "Vad ingår — och vad kostar mer senare",
    ask: "Vad är gratis, vad är engångsköp, och vad debiteras vid publicering?",
    sajtmaskin:
      "Du kan börja utan kreditkort. Ett konto får en första slutförd generering utan coin-debitering. Därefter credits som engångspaket, utan prenumeration. Publicering debiterar credits. Aktuella paket finns på prissidan.",
  },
  {
    title: "Publicering",
    why: "Domän, SSL, väg från preview till live",
    ask: "Hur landar sidan på er egen adress?",
    sajtmaskin:
      "Preview under bygget är en arbetsyta. Publicering ger en live-adress. Efter publicering kan du koppla en domän du redan äger; kopplingen kan vara stängd i vissa miljöer. Köp av ny domän i appen är inte allmänt live. Utan egen domän får sajten en Vercel-adress.",
  },
] as const;

const FITS = [
  "Ni behöver en första företagssida snabbt och kan granska texter och bilder själva",
  "Ni vill iterera utan att stå i kö hos en byrå för varje liten ändring",
  "Ni accepterar att första versionen är ett utkast, inte en färdig varumärkesmanual",
] as const;

const DOES_NOT_FIT = [
  "Komplex affärslogik, inloggning eller tung e-handel från dag ett",
  "Ett redan låst designsystem som måste återskapas pixel för pixel",
  "Känslig copy som inte får gissas — juridik, priser eller medicinska påståenden utan underlag",
] as const;

const CHECKLIST = [
  "Kan du ändra utkastet efteråt utan att kasta hela sajten?",
  "Har du tittat på mobil med bilder ni faktiskt får använda?",
  "Vet du hur publicering skiljer sig från preview, och hur egen domän kopplas?",
  "Kan du ta med koden (ZIP eller GitHub) om ni byter verktyg?",
  "Vem faktagranskar namn, priser och kontaktuppgifter innan det går live?",
  "Har du läst aktuell prissida — inte ett gammalt screenshot?",
] as const;

const FAQS = [
  {
    q: "Är en AI-hemsidebyggare samma sak som ChatGPT?",
    a: "Nej. En chatt kan skriva utkast till texter. En hemsidebyggare ska också ge struktur, layout och något du kan öppna som en sajt. I Sajtmaskin är resultatet kod i preview, inte bara ett Word-dokument.",
  },
  {
    q: "Blir sidan unik?",
    a: "Strukturen kan likna andra utkast om briefen är vag. Unikheten kommer från era foton, bevis, priser och formuleringar. Byt placeholders. Hitta inte på recensioner.",
  },
  {
    q: "Fungerar det för en riktig företagssida?",
    a: "Ja, som start för en förtroendesida: vem ni är, vad ni gör, hur man hör av sig. Det är inte rätt första verktyg när ni behöver komplex logik eller en färdig butik med betalning.",
  },
  {
    q: "Hur testar jag ett verktyg på riktigt?",
    a: "Använd en ärlig pitch, öppna resultatet på mobil, gör minst tre textändringar och titta på publiceringssteget utan att blanda ihop det med preview. Lova inte en färdig live-sajt på en halvtimme — tiden styrs av hur klart underlaget är.",
  },
  {
    q: "Vad är skillnaden mot sidan om att skapa hemsida med AI?",
    a: "Den här sidan är kategorin: vad du ska jämföra mellan AI-hemsidebyggare. AI-flödessidan går steg för steg genom Sajtmaskins process från beskrivning till första version.",
  },
] as const;

function CtaButton({ children }: { children: ReactNode }) {
  return (
    <Button
      asChild
      size="lg"
      className="btn-3d btn-glow bg-primary px-8 text-base font-medium text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary-hover"
    >
      <Link href={SEO_LANDING_CTA_HREF}>
        {children}
        <ArrowRight className="ml-1 h-4 w-4" />
      </Link>
    </Button>
  );
}

function CriteriaPreview() {
  return (
    <figure className="overflow-hidden rounded-[28px] border border-border/25 bg-card/60 shadow-[0_28px_80px_rgba(6,10,20,0.35)]">
      <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <p className="ml-2 truncate text-[11px] text-muted-foreground">
          Frågelista · inte en ranking
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 px-5 py-6 md:grid-cols-3 md:px-7 md:py-8">
        {CRITERIA.slice(0, 6).map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-border/40 bg-background/30 px-3 py-3"
          >
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.ask}</p>
          </div>
        ))}
      </div>
      <figcaption className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        Sex frågor att ta med in i valfri demo — inte en “bäst i test”-lista och inte ett
        resultatlöfte.
      </figcaption>
    </figure>
  );
}

function RelatedLink({ slug }: { slug: SeoLandingSlug }) {
  const related = getSeoLandingEntry(slug);
  return (
    <Link
      href={`/${slug}`}
      className="text-sm text-foreground/90 underline-offset-4 hover:text-foreground hover:underline"
    >
      {related.title}
    </Link>
  );
}

export const readyRelatedSeoLandingSlugs = getReadyRelatedSeoLandingSlugs;

export function AiHemsidebyggareContent() {
  const entry = getSeoLandingEntry(SLUG);
  const readyRelated = readyRelatedSeoLandingSlugs(entry.relatedSlugs);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <SiteBackground tint="analyserad" />

      <div className="relative z-10">
        <header className="flex items-center justify-between gap-4 border-b border-border/20 px-6 py-3.5">
          <Link href="/" className="text-sm font-semibold text-foreground">
            Sajtmaskin
            <span className="ml-2 hidden rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium tracking-wider text-primary uppercase sm:inline-flex">
              Beta
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/teknik"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Teknik
            </Link>
            <Link
              href="/faq"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              FAQ
            </Link>
            <Button
              asChild
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary-hover"
            >
              <Link href={entry.ctaHref}>Prova med er beskrivning</Link>
            </Button>
          </div>
        </header>

        <main>
          <section className="px-6 pt-14 pb-10 md:pt-24 md:pb-16">
            <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div>
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  AI-hemsidebyggare
                </p>
                <h1 className="text-balance font-(--font-heading) text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                  {entry.plannedH1}
                </h1>
                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                  En AI-hemsidebyggare tar dig från en beskrivning till en första sidversion.
                  Skillnaden mellan verktyg syns sällan i demot — den syns i redigering, ägarskap,
                  publicering och hur mycket du måste städa efteråt.
                </p>
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <CtaButton>Prova med er beskrivning</CtaButton>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="text-base text-muted-foreground hover:text-foreground"
                  >
                    <Link href="/skapa-hemsida-med-ai">Se AI-flödet steg för steg</Link>
                  </Button>
                </div>
              </div>
              <CriteriaPreview />
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Definition
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Från beskrivning till utkast du kan granska
              </h2>
              <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
                Mot en klassisk builder är merarbete “generera utkast” i stället för att dra block
                själv. Mot byrå är starten snabbare, men besluten — och städningen — ligger hos er.
              </p>
              <ol className="mt-10 grid gap-3 md:grid-cols-3">
                {DEFINITION_STEPS.map((step, index) => (
                  <li
                    key={step.title}
                    className="rounded-2xl border border-border/40 bg-card/70 p-5 md:p-6"
                  >
                    <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-3 font-medium text-foreground">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section id="exempel" className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Exempel
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                En brief blir sektioner — inte ett betyg
              </h2>
              <div className="mt-8 overflow-hidden rounded-[28px] border border-border/25 bg-card/60">
                <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <p className="ml-2 text-[11px] text-muted-foreground">exempel · hunddagis Malmö</p>
                </div>
                <div className="grid gap-0 lg:grid-cols-2">
                  <div className="space-y-3 border-b border-border/15 p-6 lg:border-r lg:border-b-0">
                    <p className="text-xs font-medium tracking-widest text-primary uppercase">
                      Brief
                    </p>
                    <p className="text-sm leading-relaxed text-foreground/90">
                      Vi driver hunddagis i Malmö. Sidan ska förklara schemat, vad som ingår och få
                      fler att anmäla intresse. Inga påhittade omdömen, och byt ut foton mot våra
                      egna.
                    </p>
                  </div>
                  <div className="space-y-3 p-6">
                    <p className="text-xs font-medium tracking-widest text-primary uppercase">
                      Första sektionerna
                    </p>
                    <ol className="space-y-2 text-sm text-foreground/90">
                      <li className="rounded-2xl border border-border/40 bg-background/30 px-3 py-2">
                        1. Hero + anmälan
                      </li>
                      <li className="rounded-2xl border border-border/40 bg-background/30 px-3 py-2">
                        2. Schema
                      </li>
                      <li className="rounded-2xl border border-border/40 bg-background/30 px-3 py-2">
                        3. Vad som ingår
                      </li>
                      <li className="rounded-2xl border border-border/40 bg-background/30 px-3 py-2">
                        4. Foto / om oss
                      </li>
                      <li className="rounded-2xl border border-border/40 bg-background/30 px-3 py-2">
                        5. FAQ + formulär
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Jämförelsematris
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Åtta frågor — inte en vinnarlista
              </h2>
              <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
                Använd matrisen mot vilket verktyg som helst. Kolumnen om Sajtmaskin är hur
                produkten beter sig i dag, inte ett påstående att den vinner varje rad.
              </p>
              <div className="mt-8 overflow-x-auto rounded-2xl border border-border/20">
                <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Åtta kriterier för att jämföra AI-hemsidebyggare
                  </caption>
                  <thead className="bg-card/50 text-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Kriterium
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Fråga att ta med
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        I Sajtmaskin i dag
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    {CRITERIA.map((row) => (
                      <tr key={row.title} className="border-t border-border/15">
                        <th scope="row" className="px-4 py-3 font-medium text-foreground">
                          {row.title}
                          <p className="mt-1 text-xs font-normal text-muted-foreground">{row.why}</p>
                        </th>
                        <td className="px-4 py-3">{row.ask}</td>
                        <td className="px-4 py-3">{row.sajtmaskin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto grid max-w-6xl items-start gap-4 lg:grid-cols-2">
              <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-xl text-foreground md:text-2xl">
                  AI-text är inte samma sak som AI-struktur
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Textutkast är rubriker och stycken att faktagranska. Struktur är sektioner,
                  hierarki och nästa steg. Det senare är oftast mer värt dag ett. Bäst läge: skelett
                  och utkast från AI, röst och bevis från er.
                </p>
              </div>
              <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-xl text-foreground md:text-2xl">
                  Checklista före valet
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {CHECKLIST.map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto grid max-w-6xl items-start gap-4 lg:grid-cols-2">
              <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-xl text-foreground md:text-2xl">
                  Passar när
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {FITS.map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-xl text-foreground md:text-2xl">
                  Välj något annat när
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {DOES_NOT_FIT.map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-3xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Vanliga frågor
              </p>
              <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Svar som matchar produkten i dag
              </h2>
              <dl className="mt-8 space-y-3">
                {FAQS.map((faq) => (
                  <div
                    key={faq.q}
                    className="rounded-2xl border border-border/40 bg-card/70 px-5 py-5"
                  >
                    <dt className="font-medium text-foreground">{faq.q}</dt>
                    <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.a}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 text-sm text-muted-foreground">
                Aktuella credit-paket finns på{" "}
                <Link href="/#priser" className="text-foreground underline-offset-4 hover:underline">
                  prissidan
                </Link>
                . Vill du se just Sajtmaskins flöde?{" "}
                <Link
                  href="/skapa-hemsida-med-ai"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Skapa hemsida med AI
                </Link>
                .
              </p>
            </div>
          </section>

          {readyRelated.length > 0 ? (
            <section className="border-t border-border/15 px-6 py-12">
              <div className="mx-auto max-w-6xl">
                <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                  Relaterat
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Processen i Sajtmaskin ligger på en egen sida. Jämförelser mot hemsideprogram och
                  enskilda alternativ ligger på egna sidor.
                </p>
                <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
                  {readyRelated.map((slug) => (
                    <li key={slug}>
                      <RelatedLink slug={slug} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          <section className="border-t border-border/15 px-6 py-20 md:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Jämför med riktigt innehåll
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
                Öppna byggaren med er egen pitch. Titta på struktur, mobil och hur ändringar faktiskt
                går till — inte bara på första skärmdumpen.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <CtaButton>Prova med er beskrivning</CtaButton>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="text-base text-muted-foreground hover:text-foreground"
                >
                  <Link href="/skapa-hemsida-med-ai">Se AI-flödet steg för steg</Link>
                </Button>
              </div>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </div>
  );
}
