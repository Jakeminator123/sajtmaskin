"use client";

/**
 * Kompakt cookie-banner för alla rutter UTOM landningssidan.
 *
 * På "/" äger LanyardExperience samtycket (fullskärmskortet med flip-
 * animationen). Direktbesök till t.ex. /privacy, /faq, /teknik eller
 * /builder passerar aldrig landningssidan, så utan den här bannern skulle
 * de aldrig få någon samtyckesyta alls (Bugbot high + pr-ai-review
 * F-c429fecc1255 på #1026). Bannern läser/skriver samma localStorage-
 * nycklar som lanyard-flödet, så ett val på ett ställe gäller överallt.
 *
 * Ritas som ett litet icke-blockerande kort nere till vänster — den täcker
 * aldrig sidan och kräver inget fokuslås (den är inte modal).
 */

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Cookie } from "lucide-react";

const CONSENT_KEY = "cookie-consent";
const CONSENT_DATE_KEY = "cookie-consent-date";

export function CookieBanner() {
  const pathname = usePathname();
  // Landningssidan äger samtycket via LanyardExperience. `key` nollställer
  // synlighetstillståndet vid varje ruttbyte, så ett kvarhängande "visas"
  // från en tidigare sida aldrig överlever en navigation där samtycke
  // hunnit sparas (t.ex. via lanyard-kortet på "/").
  if (pathname === "/") return null;
  return <CookieBannerInner key={pathname} />;
}

function CookieBannerInner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let consent: string | null = null;
    try {
      consent = localStorage.getItem(CONSENT_KEY);
    } catch {
      consent = null;
    }
    if (consent) return;
    const timer = setTimeout(() => setIsVisible(true), 800);
    return () => clearTimeout(timer);
  }, []);

  const persistConsent = useCallback((value: "accepted" | "declined") => {
    try {
      localStorage.setItem(CONSENT_KEY, value);
      if (value === "accepted") {
        localStorage.setItem(CONSENT_DATE_KEY, new Date().toISOString());
      }
    } catch {
      /* localStorage kan vara blockerat — dölj bannern ändå. */
    }
    setIsVisible(false);
  }, []);

  if (!isVisible) return null;

  return (
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
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
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
    </div>
  );
}
