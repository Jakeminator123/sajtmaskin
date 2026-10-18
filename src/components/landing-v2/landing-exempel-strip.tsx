import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { EXEMPEL_PATH, HOME_SHOWCASE_SITES, SHOWCASE_SITES } from "@/lib/exempel/showcase-sites";

export function LandingExempelStrip() {
  return (
    <section
      className="border-t border-border/15 px-6 py-16 md:py-24"
      aria-labelledby="landing-exempel-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium tracking-widest text-primary uppercase">
              <Sparkles className="h-3 w-3" aria-hidden />
              <span>Exempel · {SHOWCASE_SITES.length} live-byggen</span>
            </div>
            <h2
              id="landing-exempel-heading"
              className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl"
            >
              Olika riktningar, samma startpunkt
            </h2>
            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
              Från kontorsguider och interaktiva kartor till mörka produktkoncept,
              spellobbyer och kontrollpaneler. Egna projekt och rekonstruktioner
              som visar hur olika en sajt kan kännas — inte kundcase.
            </p>
          </div>
          <Link
            href={EXEMPEL_PATH}
            className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-border/40 bg-card/50 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-card/80 hover:text-primary"
          >
            Alla exempel
            <ArrowRight
              className="h-3.5 w-3.5 text-primary transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {HOME_SHOWCASE_SITES.map((site, index) => {
            const isSpotlight = index < 2;
            return (
              <li
                key={site.id}
                className={isSpotlight ? "lg:col-span-3" : "lg:col-span-2"}
              >
                <Link
                  href={EXEMPEL_PATH}
                  className="group relative flex h-full flex-col rounded-2xl border border-border/30 bg-card/35 shadow-[0_18px_44px_rgba(4,8,18,0.28)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="flex items-center justify-between gap-2 rounded-t-2xl border-b border-border/20 bg-background/55 px-3.5 py-2">
                    <span className="flex items-center gap-1.5" aria-hidden>
                      <span className="h-2 w-2 rounded-full bg-foreground/20 transition-colors group-hover:bg-primary/60" />
                      <span className="h-2 w-2 rounded-full bg-foreground/15" />
                      <span className="h-2 w-2 rounded-full bg-foreground/10" />
                    </span>
                    <span className="truncate text-[11px] font-medium text-muted-foreground/85">
                      {site.highlight}
                    </span>
                  </span>

                  <span className="relative block aspect-[16/10] overflow-hidden bg-secondary/30">
                    <Image
                      src={site.screenshotSrc}
                      alt=""
                      fill
                      sizes={
                        isSpotlight
                          ? "(min-width: 1024px) 540px, (min-width: 640px) 50vw, 100vw"
                          : "(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                      }
                      className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <span
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background/55 to-transparent opacity-70 transition-opacity group-hover:opacity-40"
                      aria-hidden
                    />
                  </span>

                  <span className="flex flex-1 flex-col justify-between px-4 py-4">
                    <span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium tracking-widest text-primary uppercase">
                          {site.industry}
                        </span>
                        <ArrowRight
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:text-primary"
                          aria-hidden
                        />
                      </span>
                      <span
                        className={`mt-1 block font-(--font-heading) tracking-tight text-foreground ${
                          isSpotlight ? "text-lg md:text-xl" : "text-base md:text-lg"
                        }`}
                      >
                        {site.name}
                      </span>
                      <span
                        className={`mt-1.5 block text-xs leading-relaxed text-muted-foreground ${
                          isSpotlight ? "line-clamp-2" : "line-clamp-2"
                        }`}
                      >
                        {site.summary}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
