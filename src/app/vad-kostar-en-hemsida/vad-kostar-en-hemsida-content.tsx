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

const SLUG = "vad-kostar-en-hemsida" as const;

const COST_PARTS = [
  {
    title: "Skapande",
    body: "Tid eller arvode för första versionen. I en AI-builder är starten ett utkast — inte en färdig varumärkesmanual.",
  },
  {
    title: "Domän",
    body: "Adressen ni äger hos en registrar, eller kopplar efter publicering. Koppling av en domän ni redan äger kan vara stängd i vissa Sajtmaskin-miljöer. Köp i appen är inte allmänt live.",
  },
  {
    title: "Hosting",
    body: "Var sidan ligger efter publicering. Preview är inte hosting. Utan egen domän får en publicerad Sajtmaskin-sajt en Vercel-adress.",
  },
  {
    title: "Innehåll",
    body: "Texter, bilder, bevis. Nästan alltid den dolda posten, oavsett verktyg.",
  },
  {
    title: "Integrationer",
    body: "Formulär, bokning, betalning, inloggning. I Sajtmaskin är sådana ytor demo tills ni uttryckligen bygger dem.",
  },
  {
    title: "Underhåll",
    body: "Ändringar, uppdateringar, någon som svarar. Engångsbygget tar inte bort löpande ansvar.",
  },
] as const;

const WORKFLOWS = [
  {
    title: "Göra själv",
    body: "Mest tid, minst arvode. Ni äger besluten — och städningen.",
  },
  {
    title: "Builder / AI",
    body: "Snabb struktur och utkast. Ni granskar. I Sajtmaskin: credits som engångsköp, utan prenumeration. Publicering debiterar credits.",
  },
  {
    title: "Frilans",
    body: "Ni köper tid. Priset styrs av omfattning och revisioner, inte av ett standardbelopp här.",
  },
  {
    title: "Byrå",
    body: "Högre start när varumärke, integrationer eller tidsbrist är större än att granska ett utkast.",
  },
] as const;

const SCOPES = [
  {
    title: "Enkel företagssida",
    body: "Vem ni är, vad ni gör, hur man hör av sig. I Sajtmaskin räcker första byggets tak på tre sidor ofta hit.",
  },
  {
    title: "Fler sidor och formulär",
    body: "Tjänster, om oss, kontakt. Fler ställer krav på innehåll — inte bara på verktyget. Extra sidor efter första bygget är merarbete.",
  },
  {
    title: "Mer komplext",
    body: "Bokning, flera språk, betalning eller inloggning. Räkna det som eget arbete eller byrå — inte som en knapp i utkastet.",
  },
] as const;

const FAQS = [
  {
    q: "Varför varierar offerter så mycket?",
    a: "Omfattning, vem som skriver innehållet, hur många varv ni ändrar, och om integrationer ska vara på riktigt. En offert utan de delarna är inte jämförbar.",
  },
  {
    q: "Vad glöms oftast bort i priset?",
    a: "Innehåll, mobilkoll, underhåll och att någon måste svara på förfrågningar. Domän och hosting är synliga — tiden efter publicering är det inte.",
  },
  {
    q: "Kan AI sänka kostnaden?",
    a: "Det kan sänka tiden till ett första utkast. Det sänker inte kravet på faktakoll, bilder och ett konkret nästa steg. I Sajtmaskin betalar du credits som engångsköp; publicering debiterar credits. Aktuella paket finns på prissidan — inget fast “hemsidepris” här.",
  },
  {
    q: "Vad kostar Sajtmaskin just nu?",
    a: "Inte ett belopp i den här texten. Credits köps som engångspaket, utan prenumeration. Ett konto får en första slutförd generering utan coin-debitering. Titta på prissidan för aktuella paket.",
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

function CostPreview() {
  return (
    <figure className="overflow-hidden rounded-[28px] border border-border/25 bg-card/60 shadow-[0_28px_80px_rgba(6,10,20,0.35)]">
      <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <p className="ml-2 truncate text-[11px] text-muted-foreground">
          Sex poster · inga prislappar
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 px-5 py-6 md:grid-cols-3 md:px-7 md:py-8">
        {COST_PARTS.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-border/40 bg-background/30 px-3 py-4"
          >
            <p className="text-sm font-medium text-foreground">{item.title}</p>
          </div>
        ))}
      </div>
      <figcaption className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        Ramverk att jämföra offerter mot — inte ett fast marknadspris och inte ett
        Sajtmaskin-belopp.
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

export function VadKostarEnHemsidaContent() {
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
              <Link href={entry.ctaHref}>Se vad ni får i byggaren</Link>
            </Button>
          </div>
        </header>

        <main>
          <section className="px-6 pt-14 pb-10 md:pt-24 md:pb-16">
            <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div>
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Kostnad
                </p>
                <h1 className="text-balance font-(--font-heading) text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                  {entry.plannedH1}
                </h1>
                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                  Det finns inget ärligt “fast pris för alla”. Priset styrs av omfattning, vem som
                  gör jobbet, och vad som är engångs respektive löpande. Här är delarna — utan
                  påhittade prislappar.
                </p>
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <CtaButton>Se vad ni får i byggaren</CtaButton>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="text-base text-muted-foreground hover:text-foreground"
                  >
                    <Link href="/skapa-hemsida-med-ai">Från beskrivning till utkast</Link>
                  </Button>
                </div>
              </div>
              <CostPreview />
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Kostnadsdelar
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Sex poster som styr mer än ett enda belopp
              </h2>
              <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {COST_PARTS.map((item) => (
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
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Arbetssätt
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Tid mot pengar — inte fake-offerter
              </h2>
              <div className="mt-10 grid gap-3 md:grid-cols-2">
                {WORKFLOWS.map((item) => (
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
            <div className="mx-auto max-w-3xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Engångs och löpande
              </p>
              <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Bygget tar slut. Underhållet gör det inte.
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                Engångs: design, första copy, setup. Löpande: domän, hosting, innehåll och att
                någon faktiskt ändrar sidan. I Sajtmaskin är credits engångsköp, inte en
                prenumeration. Publicering debiterar credits. Aktuella paket finns på{" "}
                <Link href="/#priser" className="text-foreground underline-offset-4 hover:underline">
                  prissidan
                </Link>
                .
              </p>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Tre nivåer
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Omfattning utan pristagg
              </h2>
              <ol className="mt-10 grid gap-3 md:grid-cols-3">
                {SCOPES.map((item, index) => (
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
                  Den teknikneutrala vägen, B2B-utfallet och verktygstyperna ligger på egna sidor.
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
                Testa omfattningen i praktiken
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
                Öppna byggaren med er brief. Titta på vad första utkastet faktiskt täcker innan ni
                jämför offerter.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <CtaButton>Se vad ni får i byggaren</CtaButton>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="text-base text-muted-foreground hover:text-foreground"
                >
                  <Link href="/skapa-hemsida-med-ai">Från beskrivning till utkast</Link>
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
