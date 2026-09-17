import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { LandingFooter } from "@/components/landing-v2/landing-footer";
import { SiteBackground } from "@/components/layout/site-background";
import { Button } from "@/components/ui/button";
import {
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
  type SeoLandingSlug,
} from "@/lib/seo-landing-pages/registry";

const SLUG = "hemsideprogram" as const;

const CATEGORIES = [
  {
    title: "CMS",
    body: "Innehåll, teman och plugins. Ni (eller en byrå) äger mer av hosting, uppdateringar och säkerhet. Starkt när ni redan lever i ett plugin-ekosystem.",
  },
  {
    title: "Drag-and-drop",
    body: "Visuellt bygge utan kod. Snabb start, mer beroende av plattformens editor, mallar och export. Bra om ni redan trivs i den visuella ytan.",
  },
  {
    title: "AI-builder",
    body: "Beskrivning blir ett utkast. Ni granskar, rättar och itererar. Tempo till v1 är högt — städningen av fakta och bilder ligger hos er.",
  },
  {
    title: "Kod",
    body: "Maximal kontroll över design, prestanda och integrationer. Kräver tid och kompetens, eller en byrå som skriver och underhåller.",
  },
] as const;

const MATRIX = [
  {
    question: "Tempo till v1",
    cms: "Medel",
    dnd: "Högt",
    ai: "Högt",
    code: "Lågt",
  },
  {
    question: "Designkontroll",
    cms: "Medel–hög",
    dnd: "Medel",
    ai: "Medel efter edit",
    code: "Hög",
  },
  {
    question: "Underhåll",
    cms: "Ni / byrå",
    dnd: "Plattform",
    ai: "Plattform + er copy",
    code: "Ni / byrå",
  },
  {
    question: "SEO-styrning",
    cms: "Stark om ni kan",
    dnd: "Varierar",
    ai: "Varierar",
    code: "Full",
  },
  {
    question: "Export / exit",
    cms: "Varierar per CMS",
    dnd: "Ofta begränsad",
    ai: "I Sajtmaskin: ZIP eller GitHub, inte databas/nycklar/domän",
    code: "Full — ni äger filerna",
  },
] as const;

const COST_TYPES = [
  {
    title: "Skapande",
    body: "Tid eller arvode för första versionen. I en AI-builder är starten ett utkast — inte en färdig varumärkesmanual.",
  },
  {
    title: "Domän och hosting",
    body: "Adress och var sidan ligger. Preview är inte publicering. Utan egen domän får en publicerad Sajtmaskin-sajt en Vercel-adress; koppling av en domän ni redan äger kan vara stängd i vissa miljöer.",
  },
  {
    title: "Innehåll",
    body: "Texter, bilder, bevis. Det är nästan alltid den dolda kostnaden, oavsett verktyg.",
  },
  {
    title: "Integrationer",
    body: "Formulär, bokning, betalning, inloggning. I Sajtmaskin är sådana ytor demo tills ni uttryckligen bygger dem.",
  },
  {
    title: "Underhåll",
    body: "Ändringar, uppdateringar, säkerhet. CMS och kod kräver mer löpande ansvar; builders flyttar mer till plattformen.",
  },
] as const;

const WHEN_SAJTMASKIN = [
  "Ni vill ha struktur och utkast snabbt och kan granska namn, priser och bilder själva",
  "Ni accepterar att första bygget i Sajtmaskin har taket tre sidor — fler sidor kommer senare",
  "Ni vill kunna ta med koden som ZIP eller till GitHub om ni byter senare",
] as const;

const WHEN_OTHER = [
  "Tung plugin-logik, inloggning eller e-handel från dag ett — då är CMS eller kod oftast ärligare",
  "Ett redan låst designsystem som måste återskapas pixel för pixel",
  "Ni redan trivs i en visuell drag-and-drop-editor och inte behöver lämna den",
] as const;

const FAQS = [
  {
    q: "Vad betyder hemsideprogram?",
    a: "Ordet används löst. I praktiken är det fyra arbetssätt: CMS, drag-and-drop, AI-builder eller kod. Jämför kontroll, tempo, underhåll och exit — inte logotyper.",
  },
  {
    q: "Kan jag byta senare?",
    a: "Det beror på exporten. I Sajtmaskin kan inloggad ägare ladda ner koden som ZIP eller exportera till GitHub. Med följer den genererade koden, inte databasen, API-nycklar eller domänregistrering. Många drag-and-drop-verktyg låser mer till plattformen.",
  },
  {
    q: "Behöver jag kunna koda?",
    a: "Nej för en första förtroendesida i en AI-builder. Kod ger mer kontroll senare. Välj kod eller CMS när logiken, designsystemet eller integrationerna är tyngre än att granska ett utkast.",
  },
  {
    q: "Vad styr SEO mer än verktyget?",
    a: "Tydliga sidor, ärliga texter, titlar och URL:er ni faktiskt styr, plus att sidan är snabb på mobil. Ett CMS kan vara starkt om ni kan det. En AI-builder är Next.js-kod ni kan ändra — det finns ingen separat SEO-panel att luta er mot.",
  },
  {
    q: "Vad kostar underhåll?",
    a: "Räkna tid eller arvode för innehåll och ändringar, plus hosting och eventuell byrå. Jämför arbetssätt, inte påhittade prislappar. I Sajtmaskin betalar du credits som engångsköp, utan prenumeration. Publicering debiterar credits. Aktuella paket finns på prissidan.",
  },
  {
    q: "Vilket hemsideprogram är bäst?",
    a: "Det finns inget ärligt “bäst i test” utan er brief. Fråga efter tempo till v1, hur ni redigerar, vad som exporteras och vem som underhåller. Den här sidan rankar inte varumärken.",
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

function CategoryPreview() {
  return (
    <figure className="overflow-hidden rounded-[28px] border border-border/25 bg-card/60 shadow-[0_28px_80px_rgba(6,10,20,0.35)]">
      <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <p className="ml-2 truncate text-[11px] text-muted-foreground">
          Fyra arbetssätt · inte en ranking
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 px-5 py-6 md:px-7 md:py-8">
        {CATEGORIES.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-border/40 bg-background/30 px-3 py-4"
          >
            <p className="text-sm font-medium text-foreground">{item.title}</p>
          </div>
        ))}
      </div>
      <figcaption className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        Taxonomi att välja bland — inte “bästa hemsideprogrammet” och inte ett resultatlöfte.
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

export function readyRelatedSeoLandingSlugs(slugs: readonly SeoLandingSlug[]) {
  return slugs.filter((slug) => getSeoLandingEntry(slug).status === "ready");
}

export function HemsideprogramContent() {
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
              <Link href={entry.ctaHref}>Testa AI-byggaren</Link>
            </Button>
          </div>
        </header>

        <main>
          <section className="px-6 pt-14 pb-10 md:pt-24 md:pb-16">
            <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div>
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Hemsideprogram
                </p>
                <h1 className="text-balance font-(--font-heading) text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                  {entry.plannedH1}
                </h1>
                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                  “Hemsideprogram” betyder olika saker: CMS, drag-and-drop, AI-builder eller kod.
                  Skillnaden syns i kontroll, tempo, underhåll och hur mycket ni måste äga själva
                  efter publicering.
                </p>
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <CtaButton>Testa AI-byggaren</CtaButton>
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
              <CategoryPreview />
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Fyra kategorier
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Jämför arbetssätt, inte varumärken
              </h2>
              <div className="mt-10 grid gap-3 md:grid-cols-2">
                {CATEGORIES.map((item) => (
                  <article
                    key={item.title}
                    className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8"
                  >
                    <h3 className="font-(--font-heading) text-xl text-foreground">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="exempel" className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Beslut före verktyg
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Fråga arbetssätt innan ni frågar varumärke
              </h2>
              <div className="mt-8 overflow-hidden rounded-[28px] border border-border/25 bg-card/60">
                <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <p className="ml-2 text-[11px] text-muted-foreground">
                    exempel · lokal konsultfirma
                  </p>
                </div>
                <div className="grid gap-0 lg:grid-cols-2">
                  <div className="space-y-3 border-b border-border/15 p-6 lg:border-r lg:border-b-0">
                    <p className="text-xs font-medium tracking-widest text-primary uppercase">
                      Brief
                    </p>
                    <p className="text-sm leading-relaxed text-foreground/90">
                      Lokal konsultfirma. Behöver startsida, tjänster och kontakt, plus formulär och
                      egen domän senare. En målbild på fem–sju sidor är vanlig — men fråga först hur
                      första versionen faktiskt byggs.
                    </p>
                  </div>
                  <div className="space-y-3 p-6">
                    <p className="text-xs font-medium tracking-widest text-primary uppercase">
                      Första frågan
                    </p>
                    <p className="text-sm leading-relaxed text-foreground/90">
                      Vill ni äga plugins och hosting (CMS), klicka ihop i en editor, beskriva och
                      granska ett AI-utkast, eller skriva kod? I Sajtmaskin är taket tre sidor i
                      första bygget — börja med de sidor som bär erbjudandet.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Beslutsmatris
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Fem frågor över fyra arbetssätt
              </h2>
              <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
                Matrisen är en karta, inte en vinnarlista. Inga påhittade kryss mot namngivna
                konkurrenter.
              </p>
              <div className="mt-8 overflow-x-auto rounded-2xl border border-border/20">
                <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Jämförelse av CMS, drag-and-drop, AI-builder och kod
                  </caption>
                  <thead className="bg-card/50 text-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Fråga
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        CMS
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Drag-and-drop
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        AI-builder
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Kod
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    {MATRIX.map((row) => (
                      <tr key={row.question} className="border-t border-border/15">
                        <th scope="row" className="px-4 py-3 font-medium text-foreground">
                          {row.question}
                        </th>
                        <td className="px-4 py-3">{row.cms}</td>
                        <td className="px-4 py-3">{row.dnd}</td>
                        <td className="px-4 py-3">{row.ai}</td>
                        <td className="px-4 py-3">{row.code}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Kostnadstyper
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Jämför poster, inte påhittade priser
              </h2>
              <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
                Skapande, domän, hosting, innehåll, integrationer och underhåll. Räkna inte med
                fasta kronor här — aktuella Sajtmaskin-paket finns på{" "}
                <Link href="/#priser" className="text-foreground underline-offset-4 hover:underline">
                  prissidan
                </Link>
                .
              </p>
              <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {COST_TYPES.map((item) => (
                  <article
                    key={item.title}
                    className="rounded-[28px] border border-border/40 bg-card/70 p-6"
                  >
                    <h3 className="font-(--font-heading) text-lg text-foreground">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto grid max-w-6xl items-start gap-4 lg:grid-cols-2">
              <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-xl text-foreground md:text-2xl">
                  När Sajtmaskin passar
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {WHEN_SAJTMASKIN.map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-xl text-foreground md:text-2xl">
                  Välj annat arbetssätt när
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {WHEN_OTHER.map((item) => (
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
            </div>
          </section>

          {readyRelated.length > 0 ? (
            <section className="border-t border-border/15 px-6 py-12">
              <div className="mx-auto max-w-6xl">
                <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                  Relaterat
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Den här sidan jämför verktygstyper. Djupare AI-kategori ligger på en egen sida.
                  Utan-kod och enskilda varumärkesjämförelser fylls på när de är klara.
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
                Testa arbetssättet med er pitch
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
                Öppna byggaren med en ärlig beskrivning. Titta på struktur, mobil och hur ni tar
                med koden — inte bara på första skärmdumpen.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <CtaButton>Testa AI-byggaren</CtaButton>
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
