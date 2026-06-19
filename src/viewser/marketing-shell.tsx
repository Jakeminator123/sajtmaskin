"use client";

import { useEffect } from "react";

import "@viewser/viewser.css";
import { CookieBanner } from "@viewser/components/marketing/cookie-banner";
import { CookieConsentProvider } from "@viewser/components/marketing/cookie-consent";
import { MarketingFooter } from "@viewser/components/marketing/marketing-footer";
import { MarketingHeader } from "@viewser/components/marketing/marketing-header";

/**
 * Client shell for the ported Sajtbyggaren public marketing site.
 *
 * Mirrors viewser's (marketing) layout (sticky header -> scrollable main ->
 * footer) and applies the warm Sajtbyggaren palette via `data-theme="viewser"`
 * on <html> while mounted. The cookie banner is intentionally omitted here —
 * Sajtmaskin's root layout already renders a global CookieBanner, so we keep
 * only the CookieConsentProvider for the footer's "manage cookies" control.
 */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "viewser");
    return () => {
      if (previous === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", previous);
    };
  }, []);

  return (
    <CookieConsentProvider>
      <div className="flex min-h-dvh flex-col">
        <a
          href="#main-content"
          className="bg-foreground text-background focus-visible:ring-ring/60 sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          Hoppa till innehåll
        </a>
        <MarketingHeader />
        <main id="main-content" className="flex-1 scroll-mt-16">
          {children}
        </main>
        <MarketingFooter />
      </div>
      <CookieBanner />
    </CookieConsentProvider>
  );
}
