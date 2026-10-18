import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingFooter } from "@/components/landing-v2/landing-footer";
import { SiteBackground } from "@/components/layout/site-background";
import { Button } from "@/components/ui/button";
import { publicCanonicalPath } from "@/lib/public-canonical-url";
import { getComparisonCopy, type ComparisonCopy } from "./comparison-copy";
import {
  getReadyRelatedSeoLandingSlugs,
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
  type SeoLandingSlug,
} from "./registry";

export const readyRelatedSeoLandingSlugs = getReadyRelatedSeoLandingSlugs;

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

function ComparePreview({ copy }: { copy: ComparisonCopy }) {
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
          <p className="text-sm font-medium text-foreground">{copy.previewLeftTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {copy.previewLeftBody}
          </p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-background/30 px-3 py-4">
          <p className="text-sm font-medium text-foreground">{copy.previewRightTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {copy.previewRightBody}
          </p>
        </div>
      </div>
      <figcaption className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        {copy.previewCaption}
      </figcaption>
    </figure>
  );
}

function FaqJsonLd({ copy }: { copy: ComparisonCopy }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
    url: publicCanonicalPath(`/${copy.slug}`),
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}

export function ComparisonLandingContent({ slug }: { slug: ComparisonCopy["slug"] }) {
  const entry = getSeoLandingEntry(slug);
  const copy = getComparisonCopy(slug);
  const readyRelated = readyRelatedSeoLandingSlugs(entry.relatedSlugs);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <FaqJsonLd copy={copy} />
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
              href="/hemsideprogram"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Hemsideprogram
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
              <Link href={SEO_LANDING_CTA_HREF}>{copy.ctaLabel}</Link>
            </Button>
          </div>
        </header>

        <main>
          <section className="px-6 pt-14 pb-10 md:pt-24 md:pb-16">
            <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div>
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  {copy.eyebrow}
                </p>
                <h1 className="text-balance font-(--font-heading) text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                  {entry.plannedH1}
                </h1>
                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                  {copy.lead}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Senast uppdaterad {copy.updatedAtLabel}.
                </p>
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <CtaButton>{copy.ctaLabel}</CtaButton>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="text-base text-muted-foreground hover:text-foreground"
                  >
                    <Link href="/hemsideprogram">Jämför hemsideprogram</Link>
                  </Button>
                </div>
              </div>
              <ComparePreview copy={copy} />
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
                {copy.criteriaLead}
              </p>
              <div className="mt-10 grid gap-3">
                {copy.criteria.map((row) => (
                  <article
                    key={row.title}
                    className="grid gap-4 rounded-[28px] border border-border/40 bg-card/70 p-6 md:grid-cols-[8rem_1fr_1fr] md:p-8"
                  >
                    <h3 className="font-(--font-heading) text-lg text-foreground">{row.title}</h3>
                    <div>
                      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                        {copy.competitorName}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{row.them}</p>
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
                  {copy.competitorName}
                </p>
                <h2 className="font-(--font-heading) text-2xl tracking-tight text-foreground">
                  {copy.chooseThemHeading}
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {copy.chooseThem.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Sajtmaskin
                </p>
                <h2 className="font-(--font-heading) text-2xl tracking-tight text-foreground">
                  {copy.chooseSmHeading}
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {copy.chooseSm.map((item) => (
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
                {copy.stepsHeading}
              </h2>
              <ol className="mt-10 grid gap-3 md:grid-cols-3">
                {copy.steps.map((item, index) => (
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
                {copy.noteHeading}
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                {copy.note} Aktuella Sajtmaskin-paket finns på{" "}
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
                {copy.faqs.map((faq) => (
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
                  Verktygstyperna och andra varumärkesjämförelser ligger på egna sidor.
                </p>
                <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
                  {readyRelated.map((relatedSlug) => (
                    <li key={relatedSlug}>
                      <RelatedLink slug={relatedSlug} />
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
                <CtaButton>{copy.ctaLabel}</CtaButton>
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
