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

const SLUG = "skapa-hemsida" as const;

const PROCESS_STEPS = [
  {
    title: "Syfte och målgrupp",
    body: "Bestäm vem som landar på sidan och vad de ska göra härnäst: be om offert, boka tid eller förstå erbjudandet.",
  },
  {
    title: "Innehåll före layout",
    body: "Skriv erbjudande, bevis, kontakt och vilka bilder ni faktiskt får använda. Layouten blir enklare när underlaget finns.",
  },
  {
    title: "Välj arbetssätt",
    body: "Byrå, klassiskt CMS/hemsideprogram eller en AI-assisterad builder. Välj efter tid, budget och hur ofta ni ändrar.",
  },
  {
    title: "Bygg en tydlig v1",
    body: "Startsida, erbjudande, om oss och en kontaktväg räcker långt. En första version ska kunna användas, inte vara färdig för evigt.",
  },
  {
    title: "Publicera och justera",
    body: "Publicering är ett medvetet steg, skilt från preview under arbetet. Låt riktiga frågor styra nästa förbättring.",
  },
] as const;

const PATHS = [
  {
    title: "Byrå / frilans",
    body: "Någon annan tar strategi, design och produktion. Passar när tiden är dyrare än budgeten. Ändringar går ofta via leverantören, och starten kostar mer.",
    fit: "Bra när ni vill ha det skött åt er",
  },
  {
    title: "CMS / hemsideprogram",
    body: "Ni äger strukturen och redigerar själva. Passar när ni ändrar ofta och har tid att lära er verktyget. Ansvaret för uppdateringar och tillägg ligger hos er.",
    fit: "Bra när ni vill styra sidan löpande",
  },
  {
    title: "AI-assisterad builder",
    body: "En första version från en beskrivning, sedan puts av text och bevis. Passar när ni vill se en användbar v1 snabbt. Ni granskar fortfarande allt innan det går live.",
    fit: "Bra när v1 ska ut snabbt",
  },
] as const;

const SITE_NEEDS = [
  "Startsida som på några sekunder säger vem ni är och vad besökaren ska göra",
  "Erbjudande utan jargong: vad ni gör, för vem och varför det spelar roll",
  "Bevis ni står för: jobb, kunder, omdömen eller siffror — inga påhittade recensioner",
  "Om oss med människor bakom företaget",
  "En tydlig kontakt- eller förfråganväg",
  "Praktiskt som behövs: område, öppettider, villkor",
] as const;

const PREP_ITEMS = [
  "Företagsnamn, logotyp och en kort pitch",
  "Tre saker besökaren ska förstå innan hen lämnar sidan",
  "En kontaktväg ni faktiskt svarar på",
  "Exempel på jobb eller kunder ni får visa",
  "Domänstatus: äger ni redan en, eller börjar ni på en tillfällig adress?",
  "Bilder ni har rätt att använda",
] as const;

const FAQS = [
  {
    q: "Måste jag kunna koda för att skapa en hemsida?",
    a: "Nej. En tydlig företagssida kräver inte att du skriver kod. Kod ger mer kontroll senare, men första versionen kan tas fram med byrå, ett hemsideprogram eller en builder där du styr med vanliga meningar.",
  },
  {
    q: "Hur lång tid tar det att skapa en hemsida?",
    a: "En enkel första version kan gå på dagar om innehållet redan är klart. Flaskhalsen är oftast beslut och texter, inte själva verktyget. Räkna inte med en färdig sajt samma dag om erbjudandet fortfarande är oklart.",
  },
  {
    q: "Behöver jag egen domän direkt?",
    a: "Egen domän stärker förtroendet, men ni kan publicera först och koppla en domän ni redan äger efteråt. Kopplingen kan vara stängd i vissa miljöer, och köp av ny domän i appen är inte allmänt live. Utan egen domän får den publicerade sajten en Vercel-adress. Preview under bygget är inte samma sak som en live-adress.",
  },
  {
    q: "Vad är skillnaden mot sidan om att skapa hemsida med AI?",
    a: "Den här sidan är teknikneutral: vägen från idé till publicerad företagssida, oavsett om ni tar byrå, CMS eller AI. AI-sidan går djupare på flödet från en beskrivning till ett utkast i Sajtmaskin.",
  },
  {
    q: "Kan jag byta arbetssätt senare?",
    a: "Ja, men en flytt kostar tid. I Sajtmaskin kan du som inloggad ägare exportera projektet som ZIP eller till GitHub. Med följer den genererade koden, inte databasen, API-nycklar eller domänregistrering. Välj första vägen efter hur ofta ni ändrar och om ni vill äga koden.",
  },
  {
    q: "Vad kostar det att skapa en hemsida?",
    a: "Kostnaden styrs av arbetssätt, omfattning och underhåll — inte av ett enda rätt belopp. Byrå kostar mer i start. CMS och AI-builders flyttar mer arbete till er. I Sajtmaskin betalar du credits som engångsköp, utan prenumeration. Aktuella paket finns på prissidan.",
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

function BriefToSectionsPreview() {
  return (
    <figure className="overflow-hidden rounded-[28px] border border-border/25 bg-card/60 shadow-[0_28px_80px_rgba(6,10,20,0.35)]">
      <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <p className="ml-2 truncate text-[11px] text-muted-foreground">
          Exempel · brief → sektioner · VVS Uppsala
        </p>
      </div>
      <div className="space-y-4 px-5 py-6 md:px-7 md:py-8">
        <p className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
          Er beskrivning
        </p>
        <p className="rounded-2xl border border-border/40 bg-background/40 px-4 py-3 text-sm leading-relaxed text-foreground/90">
          Vi är en VVS-firma i Uppsala. Sidan ska visa tjänster, få fler
          offertförfrågningar och se trovärdig ut på mobil.
        </p>
        <p className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
          Förslag på sektioner
        </p>
        <ul className="grid grid-cols-2 gap-2">
          {["Hero + offert", "Tjänster", "Om oss", "Bevis", "Område", "Kontakt"].map((label) => (
            <li
              key={label}
              className="rounded-2xl border border-border/40 bg-background/30 px-3 py-3 text-sm text-foreground/90"
            >
              {label}
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        Illustrerat exempel utifrån en typisk brief — inte en livekundsajt och inte ett
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

export function SkapaHemsidaContent() {
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
              <Link href={entry.ctaHref}>Skapa hemsida</Link>
            </Button>
          </div>
        </header>

        <main>
          <section className="px-6 pt-14 pb-10 md:pt-24 md:pb-16">
            <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div>
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Skapa hemsida
                </p>
                <h1 className="text-balance font-(--font-heading) text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                  {entry.plannedH1}
                </h1>
                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                  Börja med vad sidan ska göra — inte med teknikval. Beskriv verksamheten, välj väg
                  (byrå, CMS/builder eller AI), och publicera en tydlig första version ni kan
                  förbättra.
                </p>
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <CtaButton>Skapa hemsida</CtaButton>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="text-base text-muted-foreground hover:text-foreground"
                  >
                    <Link href="/skapa-hemsida-med-ai">Se hur AI-vägen fungerar</Link>
                  </Button>
                </div>
              </div>
              <BriefToSectionsPreview />
            </div>
          </section>

          <section
            id="processen"
            className="border-t border-border/15 px-6 py-16 md:py-24"
          >
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Processen
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Från idé till publicerad sida
              </h2>
              <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
                Fem steg som fungerar oavsett om ni bygger själva, anlitar hjälp eller startar från
                en AI-genererad första version.
              </p>
              <ol className="mt-10 grid gap-3 md:grid-cols-5">
                {PROCESS_STEPS.map((step, index) => (
                  <li
                    key={step.title}
                    className="rounded-2xl border border-border/40 bg-card/70 p-4 md:p-5"
                  >
                    <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-3 text-sm font-medium text-foreground md:text-base">
                      {step.title}
                    </h3>
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
                Från brief till första sektionerna
              </h2>
              <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
                Så kan en konkret beskrivning bli en sidstruktur — innan ni väljer färger och
                finesser.
              </p>
              <div className="mt-8 overflow-hidden rounded-[28px] border border-border/25 bg-card/60">
                <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <p className="ml-2 text-[11px] text-muted-foreground">
                    exempel · redovisningsbyrå
                  </p>
                </div>
                <div className="grid gap-0 lg:grid-cols-2">
                  <div className="space-y-3 border-b border-border/15 p-6 lg:border-r lg:border-b-0">
                    <p className="text-xs font-medium tracking-widest text-primary uppercase">
                      Brief
                    </p>
                    <p className="text-sm leading-relaxed text-foreground/90">
                      Vi hjälper småföretag med bokföring och årsredovisning. Sidan ska förklara
                      paket, visa vilka branscher vi kan, och få fler att boka ett
                      introduktionssamtal.
                    </p>
                  </div>
                  <div className="space-y-3 p-6">
                    <p className="text-xs font-medium tracking-widest text-primary uppercase">
                      Första sektionerna
                    </p>
                    <ol className="space-y-2 text-sm text-foreground/90">
                      <li className="rounded-2xl border border-border/40 bg-background/30 px-3 py-2">
                        1. Hero: paket + boka samtal
                      </li>
                      <li className="rounded-2xl border border-border/40 bg-background/30 px-3 py-2">
                        2. Tre erbjudanden i klartext
                      </li>
                      <li className="rounded-2xl border border-border/40 bg-background/30 px-3 py-2">
                        3. Vem det passar / inte passar
                      </li>
                      <li className="rounded-2xl border border-border/40 bg-background/30 px-3 py-2">
                        4. Kort om byrån
                      </li>
                      <li className="rounded-2xl border border-border/40 bg-background/30 px-3 py-2">
                        5. FAQ + kontaktformulär
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
                Tre vägar
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Välj arbetssätt efter de kommande sex månaderna
              </h2>
              <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
                Samma mål — olika tempo, kostnad och ansvar. Inget arbetssätt vinner alltid. Välj
                efter hur ni vill jobba, inte efter trendord.
              </p>
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {PATHS.map((path) => (
                  <article
                    key={path.title}
                    className="flex flex-col rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8"
                  >
                    <h3 className="font-(--font-heading) text-xl text-foreground">{path.title}</h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {path.body}
                    </p>
                    <p className="mt-5 text-xs font-medium tracking-wide text-primary uppercase">
                      {path.fit}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto mb-6 max-w-6xl">
              <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
                Här är minimumet innan ni väljer verktyg. Vad sidan ska åstadkomma för företaget —
                förtroende och förfrågningar — ligger på{" "}
                <Link
                  href="/hemsida-till-foretag"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  hemsida till företag
                </Link>
                .
              </p>
            </div>
            <div className="mx-auto grid max-w-6xl items-start gap-4 lg:grid-cols-2">
              <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-xl text-foreground md:text-2xl">
                  Vad en första version brukar behöva
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {SITE_NEEDS.map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-xl text-foreground md:text-2xl">
                  Förberedelse-checklista
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {PREP_ITEMS.map((item) => (
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
                Kostnad
              </p>
              <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Priset styrs av väg, omfattning och underhåll
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                Det finns inget enda rätt belopp för att skapa en hemsida. Byrå tar mer i start.
                Ett CMS eller en AI-builder flyttar mer arbete — och mer ansvar — till er.{" "}
                <Link
                  href="/vad-kostar-en-hemsida"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Vad kostar en hemsida
                </Link>{" "}
                listar kostnadsdelarna — drivare, inte en fast priskalkyl.
              </p>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                I Sajtmaskin betalar du credits som engångsköp, utan prenumeration. Publicering
                debiterar credits. Aktuella paket finns på{" "}
                <Link href="/#priser" className="text-foreground underline-offset-4 hover:underline">
                  prissidan
                </Link>
                .
              </p>
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
                Vill du se just AI-vägen mer i detalj?{" "}
                <Link
                  href="/skapa-hemsida-med-ai"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Skapa hemsida med AI
                </Link>
                . Tekniken bakom sajterna finns på{" "}
                <Link href="/teknik" className="text-foreground underline-offset-4 hover:underline">
                  /teknik
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
                  Den här sidan är teknikneutral. AI-processen, hemsideprogram och vad en hemsida
                  kostar ligger på egna sidor.
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
                Redo att skapa er hemsida?
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
                Beskriv verksamheten i byggaren och ta fram en första version. Putsa struktur och
                text när innehållet sitter.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <CtaButton>Skapa hemsida</CtaButton>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="text-base text-muted-foreground hover:text-foreground"
                >
                  <Link href="/skapa-hemsida-med-ai">Se hur AI-vägen fungerar</Link>
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
