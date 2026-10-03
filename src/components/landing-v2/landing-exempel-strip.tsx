import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EXEMPEL_PATH, HOME_SHOWCASE_SITES } from "@/lib/exempel/showcase-sites";

export function LandingExempelStrip() {
  return (
    <section className="border-t border-border/15 px-6 py-14 md:py-16" aria-labelledby="landing-exempel-heading">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-medium tracking-widest text-primary uppercase">
              Exempel
            </p>
            <h2
              id="landing-exempel-heading"
              className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-3xl"
            >
              Tre riktningar, samma startpunkt
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Rekonstruktioner som visar hur olika en sida kan kännas. Inte kundcase.
            </p>
          </div>
          <Link
            href={EXEMPEL_PATH}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Alla exempel
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        <ul className="grid gap-3 sm:grid-cols-3">
          {HOME_SHOWCASE_SITES.map((site) => (
            <li key={site.id}>
              <Link
                href={EXEMPEL_PATH}
                className="group border-border/25 bg-card/30 block rounded-2xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="relative block aspect-[16/10] overflow-hidden rounded-t-2xl">
                  <Image
                    src={site.screenshotSrc}
                    alt=""
                    fill
                    sizes="(min-width: 640px) 220px, 100vw"
                    className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </span>
                <span className="block px-3.5 py-3">
                  <span className="block font-(--font-heading) text-base text-foreground">
                    {site.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{site.industry}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
