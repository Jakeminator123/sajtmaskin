import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingFooter } from "@/components/landing-v2/landing-footer";
import { SiteBackground } from "@/components/layout/site-background";
import { Button } from "@/components/ui/button";
import {
  getReadyRelatedSeoLandingSlugs,
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
  type SeoLandingSlug,
} from "@/lib/seo-landing-pages/registry";

const SLUG = "lovable-alternativ" as const;

const GOALS = [
  {
    title: "Företagssida / landning",
    fit: "Tydligt erbjudande, förtroende, kontakt eller bokning.",
    lean: "Sajtmaskin är närmare när målet är en marknadsförande v1 på svenska, med beskrivning → utkast.",
  },
  {
    title: "App eller interaktiv produkt",
    fit: "Flöden, inloggning, databas, dashboard — något som beter sig som en applikation.",
    lean: "Lovable beskriver sig som full-stack: frontend, backend, auth och integrationer från prompt. Verifiera aktuellt läge hos dem.",
  },
  {
    title: "Intern demo / prototyp",
    fit: "Visa en idé för team eller investerare innan ni investerar i produktion.",
    lean: "Välj efter hur nära demot ska sitta er slutliga stack — inte efter logotypen.",
  },
] as const;

const CHOOSE_LOVABLE = [
  "Målet är app-lik UI, onboarding, dashboard eller en produkt med backend — inte bara en landning.",
  "Ni vill att AI:n ska kunna sätta upp databas, auth och integrationer i samma flöde.",
  "Ni accepterar att verktyget, planerna och exportläget ändras ofta. Kolla Lovable samma vecka ni beslutar.",
] as const;

const CHOOSE_SAJTMASKIN = [
  "Målet är företagssida eller landningssidor med tydlig CTA, inte app-state.",
  "Ni vill beskriva verksamheten och granska struktur + textutkast. Första bygget har taket tre sidor.",
  "Ni vill kunna ta med den genererade koden som ZIP eller till GitHub. Integrationer är demo tills ni bygger dem.",
] as const;

const QUESTIONS = [
  {
    title: "Vad ska användaren göra?",
    body: "Läsa och kontakta — eller klicka sig genom ett inloggat flöde?",
  },
  {
    title: "Vad är “klart”?",
    body: "Publicerad företagssida, intern demo, eller en applikation med backend?",
  },
  {
    title: "Vem underhåller?",
    body: "Marknadsförare som rättar copy, eller utvecklare som äger repo och databas?",
  },
] as const;

const FAQS = [
  {
    q: "Är det samma kategori?",
    a: "Delvis. Båda använder AI för att generera UI. Lovable positionerar sig som full-stack-plattform (även marketing pages). Sajtmaskin är byggt för svenska företagssidor: beskrivning → utkast, följdtext, publicering med credits.",
  },
  {
    q: "Vilket ska jag testa först?",
    a: "Utgå från leveransmålet. Företagssida → börja i Sajtmaskin. App med inloggning eller databas → utvärdera Lovable (aktuell version) först. Lovable listar också landningssidor — det är inte antingen/eller.",
  },
  {
    q: "Vad kostar Lovable?",
    a: "Inga belopp här. Lovable har egna planer och credits som ändras. Kolla deras prissidor samma vecka. Sajtmaskin säljer credits som engångsköp, utan prenumeration. Publicering debiterar credits. Aktuella paket finns på prissidan.",
  },
  {
    q: "Kan ni flytta automatiskt mellan verktygen?",
    a: "Nej. Inget one-click-byte. I Sajtmaskin kan inloggad ägare exportera ZIP eller GitHub — inte databas, nycklar eller domän. Lovable synkar kod till GitHub eller GitLab enligt deras docs; verifiera exporten hos dem.",
  },
  {
    q: "Vem har skrivit sidan?",
    a: "Sajtmaskin. Lovable utvecklas snabbt. Verifiera deras fakta mot docs.lovable.dev och deras prissidor innan ni beslutar.",
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

function GoalPreview() {
  return (
    <figure className="overflow-hidden rounded-[28px] border border-border/25 bg-card/60 shadow-[0_28px_80px_rgba(6,10,20,0.35)]">
      <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <p className="ml-2 truncate text-[11px] text-muted-foreground">
          Byggmål först · verktyg sen
        </p>
      </div>
      <div className="grid gap-2 px-5 py-6 md:px-7 md:py-8">
        {GOALS.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-border/40 bg-background/30 px-3 py-4"
          >
            <p className="text-sm font-medium text-foreground">{item.title}</p>
          </div>
        ))}
      </div>
      <figcaption className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        Inte en ranking. Lovable-fakta ska hämtas från aktuella källor — de ändras ofta.
        Skriven av Sajtmaskin.
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

export function LovableAlternativContent() {
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
                  Jämförelse · skriven av Sajtmaskin · Lovable ändras snabbt
                </p>
                <h1 className="text-balance font-(--font-heading) text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                  {entry.plannedH1}
                </h1>
                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                  Välj efter mål: marknadsförande företagssida, app eller något mitt emellan.
                  Lovable och Sajtmaskin överlappar i “AI som bygger UI” — men optimerar ofta
                  olika. Sidan är skriven av Sajtmaskin. Lovable utvecklas snabbt.
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
              <GoalPreview />
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Byggmål
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Tre mål — grov riktning, inte ranking
              </h2>
              <div className="mt-10 grid gap-3 lg:grid-cols-3">
                {GOALS.map((item) => (
                  <article
                    key={item.title}
                    className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8"
                  >
                    <h3 className="font-(--font-heading) text-xl text-foreground">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.fit}</p>
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{item.lean}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto grid max-w-6xl gap-3 lg:grid-cols-2">
              <article className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-2xl tracking-tight text-foreground">
                  Överväg Lovable när…
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {CHOOSE_LOVABLE.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-2xl tracking-tight text-foreground">
                  Överväg Sajtmaskin när…
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
                Före beslut
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Tre frågor innan featurelistor
              </h2>
              <ol className="mt-10 grid gap-3 md:grid-cols-3">
                {QUESTIONS.map((item, index) => (
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
                Caveat
              </p>
              <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Lovable ändras snabbt
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                AI-byggverktyg i den här klassen släpper funktioner ofta. Den här sidan jämför
                därför byggmål — inte en fryst featurematris. Innan ni beslutar: kolla Lovables
                egna docs och prissidor samma vecka. I Sajtmaskin är credits engångsköp;
                publicering debiterar credits. Preview är inte publicering. Aktuella paket finns
                på{" "}
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
                  AI-kategorin, steg-för-steg-flödet och verktygstyperna ligger på egna sidor.
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
                Bygger ni företagssida? Testa Sajtmaskin
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
                Kör er pitch i byggaren. Om målet i stället är en app — utvärdera det verktyget
                separat, med samma ärlighet kring scope.
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
