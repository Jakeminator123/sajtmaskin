"use client";

import { useEffect } from "react";

import "@viewser/viewser.css";
import { CookieBanner } from "@viewser/components/marketing/cookie-banner";
import { CookieConsentProvider } from "@viewser/components/marketing/cookie-consent";
import { TokenMeterProvider } from "@viewser/components/token-meter";
import { ToastProvider } from "@viewser/components/ui/toast";

/**
 * Client shell for the ported Sajtbyggaren studio surface.
 *
 * Applies the warm Sajtbyggaren palette via `data-theme="viewser"` on
 * <html> while mounted (and reverts on unmount), so the rest of the dark
 * Sajtmaskin app is untouched while portalled dialogs/sheets still inherit
 * the theme from :root. Wraps children in the toast + token-meter providers
 * the studio components expect.
 */
export function StudioShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "viewser");
    return () => {
      if (previousTheme === null) {
        root.removeAttribute("data-theme");
      } else {
        root.setAttribute("data-theme", previousTheme);
      }
    };
  }, []);

  return (
    <ToastProvider>
      <CookieConsentProvider>
        <TokenMeterProvider>{children}</TokenMeterProvider>
        <CookieBanner />
      </CookieConsentProvider>
    </ToastProvider>
  );
}
