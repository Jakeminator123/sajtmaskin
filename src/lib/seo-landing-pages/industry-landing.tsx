import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { LandingFooter } from "@/components/landing-v2/landing-footer";
import { SiteBackground } from "@/components/layout/site-background";
import { Button } from "@/components/ui/button";
import { publicCanonicalPath } from "@/lib/public-canonical-url";
import { getIndustryCopy } from "./industry-copy";
import {
  getReadyRelatedSeoLandingSlugs,
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
  type SeoIndustrySlug,
  type SeoLandingSlug,
} from "./registry";

export const readyRelatedSeoLandingSlugs = getReadyRelatedSeoLandingSlugs;

function CtaButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      asChild
      size="lg"
      className="btn-3d btn-glow bg-primary px-8 text-base font-medium text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary-hover"
    >
      <Link href={href}>
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

function IndustryPreview({
  kicker,
  caption,
  blocks,
}: {
  kicker: string;
  caption: string;
  blocks: readonly { title: string; body: string }[];
}) {
  return (
    <figure className="overflow-hidden rounded-[28px] border border-border/25 bg-card/60 shadow-[0_28px_80px_rgba(6,10,20,0.35)]">
      <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <p className="ml-2 truncate text-[11px] text-muted-foreground">{kicker}</p>
      </div>
      <div className="space-y-3 px-5 py-6 md:px-7 md:py-8">
        {blocks.map((block) => (
          <div
            key={block.title}
            className="rounded-2xl border border-border/40 bg-background/40 px-4 py-3"
          >
            <p className="text-sm font-medium text-foreground">{block.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{block.body}</p>
          </div>
        ))}
      </div>
      <figcaption className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

function FaqJsonLd({
  slug,
  faqs,
}: {
  slug: SeoIndustrySlug;
  faqs: readonly { q: string; a: string }[];
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
    url: publicCanonicalPath(`/${slug}`),
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}

export function IndustryLandingContent({ slug }: { slug: SeoIndustrySlug }) {
  const entry = getSeoLandingEntry(slug);
  const copy = getIndustryCopy(slug);
  const readyRelated = readyRelatedSeoLandingSlugs(entry.relatedSlugs);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <FaqJsonLd slug={slug} faqs={copy.faqs} />
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
              href="/hemsida-till-foretag"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Företagssida
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
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <CtaButton href={SEO_LANDING_CTA_HREF}>{copy.ctaLabel}</CtaButton>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="text-base text-muted-foreground hover:text-foreground"
                  >
                    <Link href={copy.secondaryCtaHref}>{copy.secondaryCtaLabel}</Link>
                  </Button>
                </div>
              </div>
              <IndustryPreview
                kicker={copy.previewKicker}
                caption={copy.previewCaption}
                blocks={copy.previewBlocks}
              />
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Behov
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                {copy.needsHeading}
              </h2>
              <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
                {copy.needsLead}
              </p>
              <div className="mt-10 grid gap-4 md:grid-cols-2">
                {copy.needs.map((item) => (
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
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Sektioner
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                {copy.sectionsHeading}
              </h2>
              <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
                {copy.sectionsLead}
              </p>
              <ol className="mt-10 grid gap-3 md:grid-cols-2">
                {copy.sections.map((item, index) => (
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
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Lokal synlighet
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                {copy.localHeading}
              </h2>
              <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
                {copy.localLead}
              </p>
              <ul className="mt-10 grid gap-4 md:grid-cols-2">
                {copy.localTips.map((item) => (
                  <li
                    key={item.title}
                    className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8"
                  >
                    <h3 className="flex gap-3 font-(--font-heading) text-xl text-foreground">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      {item.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-3xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Vanliga frågor
              </p>
              <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Svar för just den här branschen
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
              <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                I Sajtmaskin betalar du credits som engångsköp, utan prenumeration. Publicering
                debiterar credits. Aktuella paket finns på{" "}
                <Link href="/priser" className="text-foreground underline-offset-4 hover:underline">
                  prissidan
                </Link>
                . Preview är inte publicering. Jämför arbetssätt i{" "}
                <Link href="/hemsideprogram" className="text-foreground underline-offset-4 hover:underline">
                  hemsideprogram
                </Link>{" "}
                eller{" "}
                <Link
                  href="/wordpress-alternativ"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  alternativ till WordPress
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
                  Andra branscher och den allmänna företagssidan ligger på egna URL:er — inte som
                  kopierad text här.
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
                Beskriv verksamheten och granska utkastet
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
                Skriv vad ni gör, var ni finns och hur kunder tar kontakt. Rätta namn, tider och
                priser innan sidan går live.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <CtaButton href={SEO_LANDING_CTA_HREF}>{copy.ctaLabel}</CtaButton>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="text-base text-muted-foreground hover:text-foreground"
                >
                  <Link href={copy.secondaryCtaHref}>{copy.secondaryCtaLabel}</Link>
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
