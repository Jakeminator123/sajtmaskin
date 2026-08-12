"use client";

import { useCallback } from "react";
import { LanyardBadge } from "@/components/landing-v2/lanyard-badge";
import {
  integrations,
  landingJourneySteps,
} from "@/components/landing-v2/landing-chat-data";
import { HowItWorksLazy } from "@/components/landing-v2/landing-how-it-works-lazy";
import { IntegrationCard } from "@/components/landing-v2/landing-tech-integration-cards";
import {
  useHonestCounter,
  usePrefersReducedMotion,
  useSaveData,
} from "@/components/landing-v2/landing-hooks";

/** Marketing sections that used to live below the home hero. */
export function LandingHowPageSections() {
  const websitesCounter = useHonestCounter(
    2480,
    41,
    "41 sajter live just nu. Varje ny version ger oss bättre signaler om vad som faktiskt konverterar.",
  );
  const usersCounter = useHonestCounter(
    850,
    28,
    "28 företagare kör redan skarpt. Nästa våg handlar om fler bokningar, fler leads och bättre uppföljning.",
  );

  const reduceMotion = usePrefersReducedMotion();
  const saveData = useSaveData();
  const staticOnly = reduceMotion || saveData;
  const preloadHowItWorksScene = useCallback(() => {
    if (staticOnly) return;
    void import("./how-it-works-scene");
  }, [staticOnly]);

  return (
    <>
      <section className="relative border-t border-border/15 overflow-hidden">
        <div className="max-w-3xl mx-auto px-6 pt-16 pb-0 text-center">
          <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">
            Kvalitet i leveransen
          </p>
          <h2 className="text-2xl md:text-3xl text-foreground font-(--font-heading) tracking-tight text-balance mb-2">
            Sajter som ser bra ut och konverterar
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed text-pretty">
            Vi bygger f&ouml;r riktiga f&ouml;retag: tydlig struktur, snabb prestanda och design som
            leder till fler f&ouml;rfr&aring;gningar.
          </p>
        </div>
        <LanyardBadge />
      </section>

      <section
        id="hur-det-fungerar"
        className="px-6 py-20 md:py-28 border-t border-border/15"
        onMouseEnter={preloadHowItWorksScene}
        onFocusCapture={preloadHowItWorksScene}
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">
              Hur det fungerar
            </p>
            <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
              Från bolagsstart till gröna siffror
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
              Fr&aring;n f&ouml;rsta id&eacute; till publicerad sajt &mdash; steg f&ouml;r steg, i din
              takt.
            </p>
          </div>

          <HowItWorksLazy steps={landingJourneySteps} />
        </div>
      </section>

      <section className="px-6 py-14 border-t border-b border-border/15 bg-secondary/20">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-center gap-10 md:gap-20">
          {[websitesCounter, usersCounter].map((counter, idx) => (
            <div key={idx} className="flex flex-col items-center">
              <div className="text-center" ref={counter.ref}>
                <p
                  className={`text-3xl md:text-4xl font-(--font-heading) transition-all duration-300 ${
                    counter.phase === "glitch"
                      ? "text-destructive animate-pulse scale-110"
                      : "text-primary"
                  }`}
                >
                  <span>{counter.count.toLocaleString("sv-SE")}</span>
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {idx === 0 ? "Webbplatser skapade" : "Aktiva f\u00f6retagare"}
                </p>
                {counter.phase === "honest" && (
                  <p className="text-xs mt-2.5 max-w-[280px] leading-relaxed animate-fade-up text-muted-foreground italic">
                    {counter.message}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
        {websitesCounter.phase === "honest" && (
          <p
            className="text-center text-xs text-muted-foreground/50 mt-6 animate-fade-up"
            style={{ animationDelay: "0.3s" }}
          >
            Vi v&auml;xer med riktiga f&ouml;retag i ryggen &mdash; varje sajt &auml;r byggd f&ouml;r
            att driva aff&auml;rer, inte bara finnas.
          </p>
        )}
      </section>

      <section className="px-6 py-18 md:py-24 border-b border-border/15">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">
              Integrationer
            </p>
            <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
              Redo för riktiga arbetsflöden
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
              N&auml;r sajten beh&ouml;ver g&ouml;ra mer &auml;n se bra ut &mdash; betalningar,
              utskick, data och drift.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {integrations.map((item, index) => (
              <IntegrationCard key={item.name} item={item} index={index} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
