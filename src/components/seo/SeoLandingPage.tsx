/**
 * Render-komponent för alla SEO-landningssidor.
 *
 * En enhetlig layout som byter utseende via `familyBadge` — detta säkerställer
 * att Google inte ser sidorna som doorway pages (varje sida har unikt
 * innehåll från LLM:en), samtidigt som UI:t blir konsekvent och minimalistiskt.
 */

import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import {
  POPULAR_CITY_SLUGS,
  POPULAR_USECASE_SLUGS,
  SEO_CITIES,
  SEO_USECASES,
  hrefForSeoLanding,
} from "@/content/seo/config";
import type { SeoLandingContent } from "@/content/seo/types";
import { cn } from "@/lib/utils";

export interface SeoLandingPageProps {
  content: SeoLandingContent;
  /** Kort etikett ovan H1: "Stad", "Användningsområde", "Bransch", osv. */
  familyBadge: string;
  /** Breadcrumb-leder (namn + URL). Sista = aktuell sida. */
  breadcrumbs: Array<{ name: string; href: string }>;
}

function builderHref(prompt: string): string {
  const params = new URLSearchParams({ prompt });
  return `/builder?${params.toString()}`;
}

function SeoFaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group border-border/60 border-t py-4 [&[open]]:pb-6">
      <summary className="text-foreground flex cursor-pointer list-none items-start justify-between gap-4 text-base font-medium">
        <span>{question}</span>
        <span
          aria-hidden
          className="text-muted-foreground shrink-0 text-lg transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{answer}</p>
    </details>
  );
}

export function SeoLandingPage({ content, familyBadge, breadcrumbs }: SeoLandingPageProps) {
  const ctaHref = builderHref(content.cta.prompt);

  const popularCities = POPULAR_CITY_SLUGS.slice(0, 12)
    .map((slug) => {
      const city = SEO_CITIES.find((c) => c.slug === slug);
      return city
        ? { href: hrefForSeoLanding("city", city.slug), label: city.label }
        : null;
    })
    .filter((v): v is { href: string; label: string } => Boolean(v));

  const popularUsecases = POPULAR_USECASE_SLUGS.slice(0, 10)
    .map((slug) => {
      const usecase = SEO_USECASES.find((u) => u.slug === slug);
      return usecase
        ? { href: hrefForSeoLanding("usecase", usecase.slug), label: usecase.label }
        : null;
    })
    .filter((v): v is { href: string; label: string } => Boolean(v));

  return (
    <>
      <Navbar />
      <main className="bg-background text-foreground min-h-screen">
        <article className="mx-auto max-w-3xl px-6 py-16 md:py-20">
          <nav aria-label="Brödsmulor" className="text-muted-foreground mb-8 text-xs">
            <ol className="flex flex-wrap items-center gap-1.5">
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <li key={crumb.href} className="flex items-center gap-1.5">
                    {isLast ? (
                      <span className="text-foreground/70">{crumb.name}</span>
                    ) : (
                      <Link
                        href={crumb.href}
                        className="hover:text-foreground transition-colors"
                      >
                        {crumb.name}
                      </Link>
                    )}
                    {!isLast && <span aria-hidden>&rsaquo;</span>}
                  </li>
                );
              })}
            </ol>
          </nav>

          <header className="mb-10">
            <span
              className={cn(
                "border-border/60 bg-muted/50 text-muted-foreground inline-flex items-center",
                "rounded-full border px-3 py-1 text-xs font-medium tracking-wide uppercase",
              )}
            >
              {familyBadge}
            </span>
            <h1 className="text-foreground mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              {content.h1}
            </h1>
            <p className="text-muted-foreground mt-3 text-base leading-relaxed md:text-lg">
              {content.heroSub}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href={ctaHref}>{content.cta.buttonLabel}</Link>
              </Button>
              <span className="text-muted-foreground text-xs">
                Ingen kreditkort. Skapa gratis på minuter.
              </span>
            </div>
          </header>

          <section className="text-foreground/90 space-y-4 text-base leading-relaxed">
            {content.introParagraphs.map((paragraph, index) => (
              <p key={`intro-${index}`}>{paragraph}</p>
            ))}
          </section>

          {content.contentBlocks.length > 0 && (
            <section className="mt-14 space-y-10">
              {content.contentBlocks.map((block, index) => (
                <div key={`block-${index}`}>
                  <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
                    {block.heading}
                  </h2>
                  <p className="text-muted-foreground mt-3 text-base leading-relaxed">
                    {block.body}
                  </p>
                </div>
              ))}
            </section>
          )}

          {content.localOrIndustryContext && (
            <section className="bg-muted/40 border-border/60 mt-14 rounded-2xl border p-6">
              <p className="text-foreground/90 text-sm leading-relaxed">
                {content.localOrIndustryContext}
              </p>
            </section>
          )}

          {content.faq.length > 0 && (
            <section className="mt-16">
              <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
                Vanliga frågor
              </h2>
              <div className="mt-4">
                {content.faq.map((entry, index) => (
                  <SeoFaqItem key={`faq-${index}`} question={entry.q} answer={entry.a} />
                ))}
              </div>
            </section>
          )}

          <section className="bg-muted/40 border-border/60 mt-16 rounded-2xl border p-8 text-center">
            <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
              Redo att komma igång?
            </h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm leading-relaxed">
              Beskriv vad du behöver — vår AI bygger upp en snygg, snabb och svenskspråkig
              hemsida på minuter. Du äger allt du skapar.
            </p>
            <div className="mt-6 flex justify-center">
              <Button asChild size="lg">
                <Link href={ctaHref}>{content.cta.buttonLabel}</Link>
              </Button>
            </div>
          </section>

          {content.internalLinks.length > 0 && (
            <section className="mt-16">
              <h2 className="text-foreground text-lg font-semibold tracking-tight">
                Relaterade sidor
              </h2>
              <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {content.internalLinks.slice(0, 8).map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "border-border/60 bg-background hover:border-border block rounded-lg border px-4 py-3 text-sm transition-colors",
                        "hover:bg-muted/40",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div>
              <h3 className="text-foreground text-sm font-medium">Populära orter</h3>
              <ul className="mt-3 space-y-1.5">
                {popularCities.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      Hemsida {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-foreground text-sm font-medium">Populära användningsområden</h3>
              <ul className="mt-3 space-y-1.5">
                {popularUsecases.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      Hemsida för {link.label.toLowerCase()}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </article>
      </main>
      <Footer />
    </>
  );
}
