import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingFooter } from "@/components/landing-v2/landing-footer";
import { SiteBackground } from "@/components/layout/site-background";
import { Button } from "@/components/ui/button";
import {
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
  type SeoLandingSlug,
} from "@/lib/seo-landing-pages/registry";

const SLUG = "wix-alternativ" as const;

const CRITERIA = [
  {
    title: "Editor",
    wix: "Visuell canvas: dra, släpp och justera layout. Wix har också AI som kan starta från en prompt — ni fortsätter sedan i deras editor.",
    sm: "Beskrivning blir ett utkast. Därefter följdtext och sektionsredigering — inte punkt-och-klicka på en canvas.",
  },
  {
    title: "Tempo till v1",
    wix: "Högt om ni trivs i mallar och drag-and-drop, eller startar med deras AI och finslipar visuellt.",
    sm: "Högt när briefen är tydlig och ni granskar namn, priser och bilder i utkastet.",
  },
  {
    title: "Kontroll",
    wix: "Finkornig visuell kontroll i editorn, plus inbyggda affärsytor (butik, bokning, blogg) i samma ekosystem.",
    sm: "Kontroll via innehåll och struktur efter generering. Integrationer är demo tills ni uttryckligen bygger dem.",
  },
  {
    title: "Publicering",
    wix: "Wix hostar. Gratisplanen får en Wix-adress; egen domän och att ta bort Wix-märkning hör till deras betalda planer. Belopp finns bara hos Wix.",
    sm: "Preview är inte publicering. Utan egen domän får en publicerad sajt en Vercel-adress. Koppling av en domän ni redan äger kan vara stängd i vissa miljöer.",
  },
  {
    title: "Betalmodell",
    wix: "Gratis att skapa. Premium är prenumeration. Planer och valuta varierar — kolla Wix, inte den här sidan.",
    sm: "Credits som engångsköp, utan prenumeration. Publicering debiterar credits. Ett konto får en första slutförd generering utan coin-debitering.",
  },
  {
    title: "Exit",
    wix: "Sajten lever i Wix editor och hosting. Räkna inte med en magisk export av hela affären.",
    sm: "Inloggad ägare kan ladda ner koden som ZIP eller exportera till GitHub. Med följer den genererade koden — inte databas, API-nycklar eller domän.",
  },
] as const;

const CHOOSE_WIX = [
  "Ni vill styra layout pixel för pixel i en visuell canvas, och teamet redan kan Wix-flödet.",
  "Ni behöver Wix inbyggda butik, bokning, blogg eller App Market från start.",
  "Ni vill att hosting, editor och affärsverktyg ser ut som en och samma prenumeration.",
] as const;

const CHOOSE_SAJTMASKIN = [
  "Ni vill starta från en beskrivning och granska ett utkast, inte rita om varje block.",
  "Första bygget räcker med taket tre sidor, och extra sidor är merarbete senare.",
  "Ni vill kunna ta med den genererade koden som ZIP eller till GitHub om ni byter senare.",
] as const;

const SWITCH_STEPS = [
  {
    title: "Kartlägg nuläge",
    body: "Vad fungerar i Wix idag — mallar, appar, formulär — och vad irriterar i vardagen?",
  },
  {
    title: "Testa samma brief",
    body: "Bygg samma enkla sida i Sajtmaskin med er riktiga pitch. Jämför hur ni ändrar text utan att förstöra layout.",
  },
  {
    title: "Räkna flytten",
    body: "Texter, bilder, formulärfält, SEO-titlar, domän och redirects. Ingen one-click-migration.",
  },
] as const;

const FAQS = [
  {
    q: "Är Sajtmaskin bättre än Wix?",
    a: "Det beror på arbetssätt. Wix är starkt för visuell canvas och inbyggda affärsverktyg. Sajtmaskin är starkt för beskrivning → utkast och kod ni kan exportera. Sidan är skriven av Sajtmaskin.",
  },
  {
    q: "Vad kostar Wix?",
    a: "Inga belopp här. Wix har en gratisplan och betalda Premium-prenumerationer; priser och valuta varierar och ändras. Titta på Wix egna prissidor. Sajtmaskin säljer credits som engångsköp — aktuella paket finns på prissidan.",
  },
  {
    q: "Har Wix också AI?",
    a: "Ja. Wix beskriver en AI-webbbyggare och en hybrid där ni kan starta från en prompt och sedan finslipa med drag-and-drop. Skillnaden mot Sajtmaskin är fortfarande var ni landar: deras visuella editor och hosting, eller ett genererat utkast ni granskar som följdtext.",
  },
  {
    q: "Kan ni flytta min Wix-sida automatiskt?",
    a: "Nej. Räkna med att flytta innehåll manuellt. Planera domän och redirects som ett eget steg. I Sajtmaskin kan koppling av en domän ni redan äger vara stängd; köp i appen är inte allmänt live.",
  },
  {
    q: "Vem har skrivit den här sidan?",
    a: "Sajtmaskin. Vi jämför arbetssätt, inte feature-slam. Verifiera Wix-fakta hos Wix innan ni byter.",
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

function ComparePreview() {
  return (
    <figure className="overflow-hidden rounded-[28px] border border-border/25 bg-card/60 shadow-[0_28px_80px_rgba(6,10,20,0.35)]">
      <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <p className="ml-2 truncate text-[11px] text-muted-foreground">
          Två arbetssätt · inte feature-slam
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 px-5 py-6 md:px-7 md:py-8">
        <div className="rounded-2xl border border-border/40 bg-background/30 px-3 py-4">
          <p className="text-sm font-medium text-foreground">Wix</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Canvas · dra och justera
          </p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-background/30 px-3 py-4">
          <p className="text-sm font-medium text-foreground">Sajtmaskin</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Beskrivning → utkast
          </p>
        </div>
      </div>
      <figcaption className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        Jämför hur ni vill arbeta — inte vem som skriker högst. Skriven av Sajtmaskin.
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

export function WixAlternativContent() {
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
              <Link href={entry.ctaHref}>Testa Sajtmaskin</Link>
            </Button>
          </div>
        </header>

        <main>
          <section className="px-6 pt-14 pb-10 md:pt-24 md:pb-16">
            <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div>
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Jämförelse · skriven av Sajtmaskin
                </p>
                <h1 className="text-balance font-(--font-heading) text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                  {entry.plannedH1}
                </h1>
                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                  Wix och Sajtmaskin löser samma behov på olika sätt: visuell canvas versus
                  beskrivning → utkast. Jämför editor, kontroll och publicering — inte bara
                  featurelistor. Den här sidan är skriven av Sajtmaskin.
                </p>
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <CtaButton>Testa Sajtmaskin</CtaButton>
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
              <ComparePreview />
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Arbetssätt
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Sex rader att jämföra — inga poäng
              </h2>
              <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
                Wix-detaljer är stämda mot Wix egna sidor (editor, Harmony/AI, hosting, Premium).
                Inga Wix-belopp här. Sajtmaskin-rader är stämda mot produkten.
              </p>
              <div className="mt-10 grid gap-3">
                {CRITERIA.map((row) => (
                  <article
                    key={row.title}
                    className="grid gap-4 rounded-[28px] border border-border/40 bg-card/70 p-6 md:grid-cols-[8rem_1fr_1fr] md:p-8"
                  >
                    <h3 className="font-(--font-heading) text-lg text-foreground">{row.title}</h3>
                    <div>
                      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                        Wix
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{row.wix}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                        Sajtmaskin
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{row.sm}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto grid max-w-6xl gap-3 lg:grid-cols-2">
              <article className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Wix
                </p>
                <h2 className="font-(--font-heading) text-2xl tracking-tight text-foreground">
                  Välj Wix om…
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {CHOOSE_WIX.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Sajtmaskin
                </p>
                <h2 className="font-(--font-heading) text-2xl tracking-tight text-foreground">
                  Överväg Sajtmaskin om…
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {CHOOSE_SAJTMASKIN.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Före byte
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Tre steg innan ni lämnar Wix
              </h2>
              <ol className="mt-10 grid gap-3 md:grid-cols-3">
                {SWITCH_STEPS.map((item, index) => (
                  <li
                    key={item.title}
                    className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8"
                  >
                    <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-3 font-(--font-heading) text-xl text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-3xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Migration
              </p>
              <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Ingen one-click-flytt
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                Räkna med att flytta innehåll manuellt: texter, bilder, formulärfält och
                SEO-titlar. Vi lovar ingen automatisk migration från Wix. Domänbyte och
                redirects är ett eget steg. I Sajtmaskin är credits engångsköp; publicering
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
                Svar utan hittepå-kronor
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
                  Verktygstyperna, AI-kategorin och den teknikneutrala vägen ligger på egna sidor.
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
                Testa Sajtmaskin med samma brief
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
                Bygg en enkel sida med ert riktiga innehåll. Då syns skillnaden i arbetssätt
                tydligare än i en featurelista.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <CtaButton>Testa Sajtmaskin</CtaButton>
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
