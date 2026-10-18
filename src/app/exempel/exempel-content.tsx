import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EXEMPEL_BUILDER_HREF,
  EXEMPEL_DISCLOSURE,
  EXEMPEL_SECONDARY_HREF,
  SHOWCASE_EXTERNAL_REL,
  SHOWCASE_SITES,
} from "@/lib/exempel/showcase-sites";

export function ExempelContent() {
  return (
    <main>
      <section className="px-6 pt-16 pb-8 md:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Tillbaka till start
          </Link>
          <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
            Exempel
          </p>
          <h1 className="text-balance font-(--font-heading) text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
            Hemsidor och idéer byggda som Sajtmaskin-exempel
          </h1>
          <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed md:text-lg">
            Tio publika exempel och rekonstruktioner som visar olika riktningar:
            kontorsguider, interaktiva kartor, B2B-koncept, spellobbyer,
            kontrollpaneler, corporate SaaS och lokal verksamhet. Öppna ett
            exempel, eller börja med en egen beskrivning.
          </p>
          <aside
            className="border-border/30 bg-card/40 mx-auto mt-8 max-w-2xl rounded-2xl border px-5 py-4 text-left text-sm leading-relaxed text-muted-foreground"
            aria-label="Om exemplen"
          >
            {EXEMPEL_DISCLOSURE}
          </aside>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary-hover px-8 text-base font-medium shadow-lg shadow-primary/25"
            >
              <Link href={EXEMPEL_BUILDER_HREF}>
                Skapa din egen sajt
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="text-base text-muted-foreground hover:text-foreground"
            >
              <Link href={EXEMPEL_SECONDARY_HREF}>Så funkar det med AI</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="px-6 pb-16 md:pb-24" aria-labelledby="exempel-grid-heading">
        <div className="mx-auto max-w-6xl">
          <h2 id="exempel-grid-heading" className="sr-only">
            Alla exempel
          </h2>
          <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
            {SHOWCASE_SITES.map((site, index) => {
              const isWide = index < 2 || index >= 8;
              return (
                <li
                  key={site.id}
                  className={isWide ? "xl:col-span-3" : "xl:col-span-2"}
                >
                  <article className="border-border/30 bg-card/35 h-full rounded-[28px] border shadow-[0_24px_60px_rgba(6,10,20,0.26)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card/55">
                    <a
                      href={site.href}
                      target="_blank"
                      rel={SHOWCASE_EXTERNAL_REL}
                      aria-label={`Öppna exemplet ${site.name} (öppnas i ny flik)`}
                      className="group flex h-full flex-col rounded-[28px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <span className="flex items-center justify-between gap-2 rounded-t-[28px] border-b border-border/20 bg-background/55 px-4 py-2.5">
                        <span className="flex items-center gap-1.5" aria-hidden>
                          <span className="h-2.5 w-2.5 rounded-full bg-foreground/20 transition-colors group-hover:bg-primary/65" />
                          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
                          <span className="h-2.5 w-2.5 rounded-full bg-foreground/10" />
                        </span>
                        <span className="truncate text-xs font-medium text-muted-foreground/85">
                          {site.highlight}
                        </span>
                      </span>

                      <span className="relative block aspect-[16/10] overflow-hidden bg-secondary/30">
                        <Image
                          src={site.screenshotSrc}
                          alt=""
                          fill
                          sizes={
                            isWide
                              ? "(min-width: 1280px) 560px, (min-width: 768px) 45vw, 100vw"
                              : "(min-width: 1280px) 360px, (min-width: 768px) 45vw, 100vw"
                          }
                          className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                        <span
                          className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background/55 to-transparent opacity-70 transition-opacity group-hover:opacity-40"
                          aria-hidden
                        />
                      </span>

                      <span className="flex flex-1 flex-col px-5 py-5">
                        <span className="text-xs font-medium tracking-widest text-primary uppercase">
                          {site.industry}
                        </span>
                        <h3 className="mt-2 font-(--font-heading) text-2xl tracking-tight text-foreground">
                          {site.name}
                        </h3>
                        <span className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                          {site.summary}
                        </span>
                        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 group-hover:underline">
                          Öppna exemplet
                          <ArrowUpRight
                            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                            aria-hidden
                          />
                        </span>
                      </span>
                    </a>
                  </article>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="border-t border-border/15 px-6 py-16 md:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
            Vill du ha en egen riktning?
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-pretty text-sm leading-relaxed md:text-base">
            Beskriv företaget i byggaren. Exemplen ovan är inspiration, inte en
            mall du måste kopiera.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary-hover px-8 text-base font-medium shadow-lg shadow-primary/25"
            >
              <Link href={EXEMPEL_BUILDER_HREF}>
                Öppna byggaren
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="text-base text-muted-foreground hover:text-foreground"
            >
              <Link href={EXEMPEL_SECONDARY_HREF}>Läs om att skapa hemsida med AI</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
