"use client";

/**
 * Infinite scrolling marquee showing company names.
 * Pure CSS animation — zero JS overhead, no external dependencies.
 */

const COMPANIES = [
  "Max Ventures",
  "Bilen&Jag",
  "Prometheus",
  "DG97",
  "1753 Scincare",
  "Raymond Media",
];

export function TrustedByMarquee() {
  return (
    <section className="border-border/30 relative overflow-hidden border-y py-10">
      {/* Fade edges */}
      <div className="from-background pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-linear-to-r to-transparent" />
      <div className="from-background pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-linear-to-l to-transparent" />

      <p className="text-muted-foreground/50 mb-6 text-center text-xs font-medium uppercase tracking-widest">
        Betrodda av företag som
      </p>

      <div className="marquee-container flex gap-0 text-[160px]">
        <div className="marquee-track flex shrink-0 items-center gap-12 px-6">
          {COMPANIES.map((name) => (
            <span
              key={name}
              className="text-muted-foreground/40 hover:text-muted-foreground whitespace-nowrap font-medium tracking-tight transition-colors duration-300"
            >
              {name}
            </span>
          ))}
        </div>
        <div className="marquee-track flex shrink-0 items-center gap-12 px-6" aria-hidden="true">
          {COMPANIES.map((name) => (
            <span
              key={`dup-${name}`}
              className="text-muted-foreground/40 hover:text-muted-foreground whitespace-nowrap font-medium tracking-tight transition-colors duration-300"
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      <style jsx>{`
        .marquee-container {
          width: 100%;
        }
        .marquee-track {
          animation: marquee 40s linear infinite;
        }
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-100%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}
