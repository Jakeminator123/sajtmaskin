"use client";

/**
 * Kompakt cookie-banner för alla rutter UTOM landningssidan i desktop-läge.
 *
 * På "/" i desktop äger LanyardExperience samtycket (kortet med
 * flip-animationen, ägarbeslut 2026-11-20: desktop kräver fortfarande ett
 * val). Mobil / reduced-motion / Save-Data på "/" använder den här bannern via
 * LanyardExperience, så cookietexten inte blir LCP. Direktbesök till t.ex.
 * /privacy, /faq, /teknik eller /builder passerar aldrig landningssidan, så
 * utan den här bannern skulle de aldrig få någon samtyckesyta alls (Bugbot
 * high + pr-ai-review F-c429fecc1255 på #1026). Bannern läser/skriver samma
 * localStorage-nycklar som lanyard-flödet, så ett val på ett ställe gäller
 * överallt.
 *
 * Under `md` är bannern en låg remsa i fönstrets nederkant (rigg V-05,
 * SM-137: kortet låg över promptfältet på 390 px). Remsan skriver sin höjd
 * till `--cookie-banner-h` på `<html>`, och app-skalen som fyller fönstret
 * drar av den (`APP_VIEWPORT_HEIGHT_CLASS`), så den tar egen plats i stället
 * för att ligga över promptfältet eller komposern. Från `md` är det samma
 * lilla kort nere till vänster som tidigare, och skalen krymper inte.
 * Ingen av varianterna är modal (ingen fokusfälla).
 */

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Cookie } from "lucide-react";
import { dispatchCookieConsentChange } from "@/lib/ads/fire-google-ads-conversion";
import { COOKIE_BANNER_HEIGHT_VAR } from "@/lib/app-viewport";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import {
  LANYARD_CONSENT_DATE_KEY,
  LANYARD_CONSENT_KEY,
  readStoredCookieConsent,
} from "@/components/landing-v2/lanyard-consent";

/** Under Tailwinds `md`: remsan i stället för kortet. */
const BELOW_MD_MEDIA_QUERY = "(max-width: 767px)";

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
  const isMobile = useMediaQuery(BELOW_MD_MEDIA_QUERY);
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  usePublishedBannerHeight(isVisible && isMobile ? strip : null);

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
        /* localStorage kan vara blockerat — dölj bannern ändå. */
      }
      dispatchCookieConsentChange(value);
      setIsVisible(false);
      onConsent?.(value);
    },
    [onConsent],
  );

  if (!isVisible) return null;

  if (isMobile) {
    return createPortal(
      <div
        ref={setStrip}
        role="dialog"
        aria-modal="false"
        aria-label="Cookie-inställningar"
        className="fixed inset-x-0 bottom-0 z-[80] border-t border-border/60 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.25)] backdrop-blur"
      >
        <div className="flex items-center gap-3 px-4 py-2.5">
          <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
            <span className="font-semibold text-foreground">Vi använder cookies.</span> För att
            förbättra din upplevelse, analysera trafik och visa relevant innehåll. Läs mer i vår{" "}
            <a href="/privacy" className="text-primary underline underline-offset-2">
              integritetspolicy
            </a>
            .
          </p>
          <div className="flex shrink-0 flex-col gap-1.5">
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

  return createPortal(
    <div
      role="dialog"
      aria-label="Cookie-inställningar"
      className="fixed bottom-4 left-4 z-[80] w-[min(92vw,360px)] rounded-2xl border border-border/60 bg-card/95 p-4 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Cookie className="h-4 w-4" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-foreground">Vi använder cookies</p>
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
        För att förbättra din upplevelse, analysera trafik och visa relevant innehåll. Läs mer i
        vår{" "}
        <a href="/privacy" className="text-primary underline underline-offset-2">
          integritetspolicy
        </a>
        .
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => persistConsent("accepted")}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          Acceptera alla
        </button>
        <button
          type="button"
          onClick={() => persistConsent("declined")}
          className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          Endast nödvändiga
        </button>
      </div>
    </div>,
    document.body,
  );
}
