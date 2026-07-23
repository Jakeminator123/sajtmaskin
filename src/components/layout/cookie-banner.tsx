"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Cookie, Gamepad2 } from "lucide-react";

/**
 * Compact GDPR cookie-consent banner.
 *
 * Renders as a small non-blocking card in the bottom-left corner — it never
 * covers the page or competes with the hero/first impression. The playful
 * Pac-Man "Cookie Quest" is still available, but strictly opt-in via a small
 * button (and lazy-loaded so the game code stays out of the initial bundle).
 */

const CookieGameModal = dynamic(
  () => import("@/components/layout/cookie-game").then((m) => m.CookieGameModal),
  { ssr: false },
);

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [showGame, setShowGame] = useState(false);

  // Check cookie consent on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cookieConsent = localStorage.getItem("cookie-consent");
    if (!cookieConsent) {
      const timer = setTimeout(() => setIsVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const persistConsent = (value: "accepted" | "declined") => {
    if (typeof window !== "undefined") {
      localStorage.setItem("cookie-consent", value);
      if (value === "accepted") {
        localStorage.setItem("cookie-consent-date", new Date().toISOString());
      }
    }
    setShowGame(false);
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <>
      <aside
        role="dialog"
        aria-label="Cookie-inställningar"
        className="border-border/60 bg-card/95 fixed bottom-4 left-4 z-40 w-[calc(100vw-2rem)] max-w-sm rounded-xl border p-4 shadow-2xl backdrop-blur-md"
      >
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <Cookie className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-foreground text-sm font-medium">Vi använder cookies</p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              För att förbättra din upplevelse, analysera trafik och visa relevant innehåll. Läs
              mer i vår{" "}
              <a href="/privacy" className="text-primary underline underline-offset-2">
                integritetspolicy
              </a>
              .
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => persistConsent("accepted")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors"
          >
            Acceptera alla
          </button>
          <button
            onClick={() => persistConsent("declined")}
            className="border-border text-muted-foreground hover:bg-secondary hover:text-foreground rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors"
          >
            Endast nödvändiga
          </button>
          <button
            onClick={() => setShowGame(true)}
            className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-[11px] transition-colors"
            title="Spela Cookie Quest — vinn för att acceptera cookies"
          >
            <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
            Spela istället
          </button>
        </div>
      </aside>

      {showGame && (
        <CookieGameModal
          onWin={() => persistConsent("accepted")}
          onClose={() => setShowGame(false)}
        />
      )}
    </>
  );
}
