"use client";

import { trustLogos } from "@/components/landing-v2/landing-chat-data";

/** Trust strip: "Byggd med samma teknik som" + scrolling company names. */
export function LandingTrustMarquee({
  className = "",
}: {
  className?: string;
}) {
  return (
    <section className={`shrink-0 py-6 md:py-8 border-t border-border/15 ${className}`.trim()}>
      <p className="text-xs text-muted-foreground/60 text-center mb-1.5 tracking-widest uppercase">
        Byggd med samma teknik som
      </p>
      <p className="text-[10px] text-muted-foreground/40 text-center mb-4 md:mb-5">
        Dessa f&ouml;retag anv&auml;nder React &amp; Next.js &mdash; samma ramverk vi bygger din sajt
        med
      </p>
      <div className="relative overflow-hidden" aria-hidden="true">
        <div className="absolute inset-y-0 left-0 w-24 md:w-32 bg-linear-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-24 md:w-32 bg-linear-to-l from-background to-transparent z-10 pointer-events-none" />
        <div className="flex animate-marquee whitespace-nowrap">
          {[...trustLogos, ...trustLogos].map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="mx-10 text-base md:text-lg text-muted-foreground/30 font-(--font-heading) tracking-tight select-none"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
