"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  flushPendingGoogleAdsConversions,
  hasAcceptedCookieConsent,
  noteAccountCreatedFromLocation,
  noteBuilderStartFromLocation,
  subscribeCookieConsent,
} from "@/lib/ads/fire-google-ads-conversion";
import { getGoogleAdsConfig, isAdminAppPath, isGoogleAdsEnabled } from "@/lib/ads/google-ads";

function injectGoogleAdsTag(adsId: string, nonce?: string): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag === "function") return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", adsId);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`;
  if (nonce) script.setAttribute("nonce", nonce);
  document.head.appendChild(script);
}

export function GoogleAdsTag({ nonce }: { nonce?: string }) {
  const pathname = usePathname();
  const [consentAccepted, setConsentAccepted] = useState(false);

  useEffect(() => {
    setConsentAccepted(hasAcceptedCookieConsent());
    return subscribeCookieConsent(setConsentAccepted);
  }, []);

  useEffect(() => {
    const config = getGoogleAdsConfig();
    if (!isGoogleAdsEnabled(config) || !config.adsId) return;
    if (isAdminAppPath(pathname)) return;
    if (!consentAccepted) return;

    injectGoogleAdsTag(config.adsId, nonce);
    noteBuilderStartFromLocation(pathname);
    noteAccountCreatedFromLocation();
    flushPendingGoogleAdsConversions();
  }, [consentAccepted, nonce, pathname]);

  return null;
}
