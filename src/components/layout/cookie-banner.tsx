"use client";

/**
 * Cookie-remsan för alla rutter UTOM landningssidan i desktop-läge.
 *
 * På "/" i desktop äger LanyardExperience samtycket (kortet med
 * flip-animationen, ägarbeslut 2026-11-20: desktop kräver fortfarande ett
 * val). Mobil / reduced-motion / Save-Data på "/" använder den här remsan via
 * LanyardExperience, så cookietexten inte blir LCP. Direktbesök till t.ex.
 * /privacy, /faq, /teknik eller /builder passerar aldrig landningssidan, så
 * utan den här remsan skulle de aldrig få någon samtyckesyta alls (Bugbot
 * high + pr-ai-review F-c429fecc1255 på #1026). Remsan läser/skriver samma
 * localStorage-nycklar som lanyard-flödet, så ett val på ett ställe gäller
 * överallt.
 *
 * Riggen 2026-11-11 (V-05, SM-137): det kompakta kortet låg över promptfältet
 * på 390 px. Nu är det en låg remsa i fönstrets nederkant. Den är inte modal
 * (ingen fokusfälla), portas till body och skriver sin höjd till
 * `--cookie-banner-h` på `<html>`. App-skalen som fyller fönstret drar av den
 * höjden (`APP_VIEWPORT_HEIGHT_CLASS`), så remsan tar egen plats i stället för
 * att ligga över promptfältet eller komposern.
 */

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Cookie } from "lucide-react";
import { dispatchCookieConsentChange } from "@/lib/ads/fire-google-ads-conversion";
import { COOKIE_BANNER_HEIGHT_VAR } from "@/lib/app-viewport";
import {
  LANYARD_CONSENT_DATE_KEY,
  LANYARD_CONSENT_KEY,
  readStoredCookieConsent,
} from "@/components/landing-v2/lanyard-consent";

const BUTTON_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function CookieBanner() {
  const pathname = usePathname();
  // Landningssidan äger samtycket via LanyardExperience (flip-kort på
  // desktop, remsan på mobil). `key` nollställer synlighetstillståndet vid
  // varje ruttbyte.
  if (pathname === "/") return null;
  return <CompactCookieBanner key={pathname} />;
}

/** Håller `--cookie-banner-h` i synk med remsans faktiska höjd. */
function usePublishedBannerHeight(element: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!element) return;
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty(
        COOKIE_BANNER_HEIGHT_VAR,
        `${Math.ceil(element.getBoundingClientRect().height)}px`,
      );
    };
    publish();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(publish) : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(COOKIE_BANNER_HEIGHT_VAR);
    };
  }, [element]);
}

export function CompactCookieBanner({
  delayMs = 800,
  onConsent,
}: {
  delayMs?: number;
  onConsent?: (value: "accepted" | "declined") => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  usePublishedBannerHeight(isVisible ? strip : null);

  useEffect(() => {
    if (readStoredCookieConsent()) return;
    const timer = setTimeout(() => setIsVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  const persistConsent = useCallback(
    (value: "accepted" | "declined") => {
      try {
        localStorage.setItem(LANYARD_CONSENT_KEY, value);
        if (value === "accepted") {
          localStorage.setItem(LANYARD_CONSENT_DATE_KEY, new Date().toISOString());
        }
      } catch {
        /* localStorage kan vara blockerat — dölj remsan ändå. */
      }
      dispatchCookieConsentChange(value);
      setIsVisible(false);
      onConsent?.(value);
    },
    [onConsent],
  );

  if (!isVisible) return null;

  return createPortal(
    <div
      ref={setStrip}
      role="dialog"
      aria-modal="false"
      aria-label="Cookie-inställningar"
      className="fixed inset-x-0 bottom-0 z-[80] border-t border-border/60 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.25)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 md:gap-4 md:py-3">
        <Cookie className="hidden h-4 w-4 shrink-0 text-primary md:block" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
          <span className="font-semibold text-foreground">Vi använder cookies.</span> För att
          förbättra din upplevelse, analysera trafik och visa relevant innehåll. Läs mer i vår{" "}
          <a href="/privacy" className="text-primary underline underline-offset-2">
            integritetspolicy
          </a>
          .<span className="hidden md:inline"> Ditt val sparas på den här enheten.</span>
        </p>
        <div className="flex shrink-0 flex-col gap-1.5 md:flex-row md:gap-2">
          <button
            type="button"
            onClick={() => persistConsent("accepted")}
            className={`rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover ${BUTTON_FOCUS}`}
          >
            Acceptera alla
          </button>
          <button
            type="button"
            onClick={() => persistConsent("declined")}
            className={`rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ${BUTTON_FOCUS}`}
          >
            Endast nödvändiga
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
