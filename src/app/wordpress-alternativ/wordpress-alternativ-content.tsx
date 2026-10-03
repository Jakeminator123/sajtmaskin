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

const SLUG = "wordpress-alternativ" as const;

const STRENGTHS = [
  "Stort ekosystem av teman och plugins — inklusive e-handel via WooCommerce när ni behöver den ytan.",
  "Flexibelt för redaktörsflöden, egna innehållstyper och byråer som redan lever i WP.",
  "Stor kompetensbas: community, frilansare och byråer.",
  "Öppen källkod på wordpress.org: ni kan installera programvaran hos valfri host.",
] as const;

const RESPONSIBILITIES = [
  "Vid självhostat WordPress (wordpress.org) väljer och betalar ni hosting själva, och någon måste sköta kärna, tema och plugins.",
  "WordPress.com är en annan sak: Automattic hostar och sköter mer av drift och uppdateringar. Planer och belopp finns bara hos dem.",
  "Kompatibilitet när tillägg ändras är ett underhåll, inte ett skräckscenario.",
  "Backups och återställning är rutin — i alla stackar.",
] as const;

const WHEN_OTHER = [
  {
    title: "Enkel företagssida",
    body: "Få sidor och ett formulär. I Sajtmaskin räcker första byggets tak på tre sidor ofta hit — utan plugin-yta.",
  },
  {
    title: "Få redaktörer",
    body: "En–två personer som uppdaterar texter behöver sällan hela CMS-kraften.",
  },
  {
    title: "Vill minska drift",
    body: "Om ingen ska äga uppdateringar och hosting: ett smalare arbetssätt kan vara ärligare än en full WP-stack.",
  },
] as const;

const STAY_WP = [
  "Ni behöver plugins, WooCommerce-nivå av butik eller en redaktörsprocess som redan fungerar i WordPress.",
  "Ni har byrå eller intern kompetens som underhåller kärna, tema och tillägg.",
  "Ni vill äga en klassisk CMS-stack — självhostat eller via WordPress.com — och det är poängen, inte ett hinder.",
] as const;

const CHOOSE_SM = [
  "Ni vill starta från en beskrivning och granska ett utkast, inte sätta upp hosting och plugins först.",
  "Behovet är främst marknadsförande sidor, inte tung CMS-logik.",
  "Ni vill kunna ta med den genererade koden som ZIP eller till GitHub om ni byter senare.",
] as const;

const STEPS = [
  {
    title: "Lista måste-krav",
    body: "Plugins, redaktörsroller, flerspråk, e-handel, egna posttyper — eller bara startsida, tjänster och kontakt?",
  },
  {
    title: "Väg driftansvar",
    body: "Vem sköter hosting, uppdateringar och backups efter launch? Självhostat och WordPress.com ger olika svar.",
  },
  {
    title: "Testa alternativet",
    body: "Om kraven är enkla: bygg samma v1 i Sajtmaskin och jämför tempo mot er WordPress-plan.",
  },
] as const;

const FAQS = [
  {
    q: "Måste jag lämna WordPress?",
    a: "Nej. Om ekosystem och plugins är poängen är WordPress ofta rätt. Ett annat arbetssätt är aktuellt när behoven är enklare.",
  },
  {
    q: "Är WordPress osäkert?",
    a: "Nej. Det är ett sakligt driftsansvar. Uppdateringar och hosting spelar roll, precis som i andra stackar. Ingen skräckcopy här.",
  },
  {
    q: "Vad är skillnaden mellan wordpress.org och WordPress.com?",
    a: "wordpress.org är den fria GPL-programvaran ni installerar hos en host ni väljer. WordPress.com är Automattic’s hostade tjänst, med egna planer. Påståenden om den ena gäller inte automatiskt den andra. Inga belopp här.",
  },
  {
    q: "Kan ni migrera automatiskt?",
    a: "Nej. Planera innehåll, media och SEO-titlar som ett projektsteg. I Sajtmaskin kan inloggad ägare exportera ZIP eller GitHub — inte databas, nycklar eller domän.",
  },
  {
    q: "Vem har skrivit sidan?",
    a: "Sajtmaskin. WordPress-fakta om planer och hosting ska stämmas av mot wordpress.org och WordPress.com, inte mot den här texten.",
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
          Ekosystem vs snabbare utkast
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 px-5 py-6 md:px-7 md:py-8">
        <div className="rounded-2xl border border-border/40 bg-background/30 px-3 py-4">
          <p className="text-sm font-medium text-foreground">WordPress</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Plugins · teman · flexibilitet
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
        Fair tradeoff — inte skräckretorik om säkerhet. Skriven av Sajtmaskin.
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

export function WordpressAlternativContent() {
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
                  Jämförelse · skriven av Sajtmaskin
                </p>
                <h1 className="text-balance font-(--font-heading) text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                  {entry.plannedH1}
                </h1>
                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                  WordPress är starkt när ni vill ha ekosystem och plugins. Ett annat arbetssätt
                  kan passa bättre när ni vill ha snabbare första utkast med mindre driftansvar.
                  Den här sidan är skriven av Sajtmaskin.
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
              <ComparePreview />
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto grid max-w-6xl gap-3 lg:grid-cols-2">
              <article className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Styrkor
                </p>
                <h2 className="font-(--font-heading) text-2xl tracking-tight text-foreground">
                  WordPress-styrkor
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {STRENGTHS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Ansvar
                </p>
                <h2 className="font-(--font-heading) text-2xl tracking-tight text-foreground">
                  Ansvar ni tar — sakligt
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {RESPONSIBILITIES.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                  Ansvar är inte samma sak som “WordPress är osäkert”. Det betyder att någon
                  måste sköta underhållet.
                </p>
              </article>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                När annat passar
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Tre fall där CMS-kraften kan vara överkurs
              </h2>
              <div className="mt-10 grid gap-3 md:grid-cols-3">
                {WHEN_OTHER.map((item) => (
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

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto grid max-w-6xl gap-3 lg:grid-cols-2">
              <article className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-2xl tracking-tight text-foreground">
                  Stanna på WordPress om…
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {STAY_WP.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-2xl tracking-tight text-foreground">
                  Överväg Sajtmaskin om…
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {CHOOSE_SM.map((item) => (
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
                Avgör arbetssätt i tre steg
              </h2>
              <ol className="mt-10 grid gap-3 md:grid-cols-3">
                {STEPS.map((item, index) => (
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
                Ingen automatisk flytt
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                Innehåll, media och SEO-titlar måste planeras. Vi lovar ingen automatisk
                migration från WordPress. Preview är inte publicering. Utan egen domän får en
                publicerad Sajtmaskin-sajt en Vercel-adress. Credits är engångsköp; publicering
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
                Svar utan skräckcopy
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
                  Verktygstyperna, no-code-sidan och AI-flödet ligger på egna sidor.
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
                Testa om AI-utkast räcker för er v1
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
                Om briefen är enkel: bygg samma sida i Sajtmaskin och jämför tempo och
                underhållsyta mot er WordPress-plan.
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
