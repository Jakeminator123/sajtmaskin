"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  flushPendingGoogleAdsConversions,
  hasAcceptedCookieConsent,
  isGoogleAdsPending,
  noteAccountCreatedFromLocation,
  noteBuilderStartFromLocation,
  subscribeCookieConsent,
} from "@/lib/ads/fire-google-ads-conversion";
import {
  getGoogleAdsConfig,
  conversionId,
  GOOGLE_ADS_CONVERSION_EVENTS,
  isAdminAppPath,
  isGoogleAdsEnabled,
} from "@/lib/ads/google-ads";
import { loadGoogleAdsTag } from "@/lib/ads/load-google-ads-tag";

function getServerCookieConsentSnapshot(): boolean {
  return false;
}

function subscribeConsent(onStoreChange: () => void): () => void {
  return subscribeCookieConsent(() => {
    onStoreChange();
  });
}

export function GoogleAdsTag({ nonce }: { nonce?: string }) {
  const pathname = usePathname();
  const consentAccepted = useSyncExternalStore(
    subscribeConsent,
    hasAcceptedCookieConsent,
    getServerCookieConsentSnapshot,
  );

  useEffect(() => {
    const config = getGoogleAdsConfig();
    if (!isGoogleAdsEnabled(config) || !config.adsId) return;
    if (isAdminAppPath(pathname)) return;
    if (!consentAccepted) return;

    noteBuilderStartFromLocation(pathname);
    noteAccountCreatedFromLocation();
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1_000;
    const adsId = config.adsId;
    const attempt = async () => {
      let loaded = false;
      try {
        loaded = await loadGoogleAdsTag(adsId, nonce);
      } catch {
        /* retry, never claim */
      }
      if (stopped || !hasAcceptedCookieConsent() || isAdminAppPath(window.location.pathname))
        return;
      if (loaded) {
        flushPendingGoogleAdsConversions();
      }
      if (
        !loaded ||
        GOOGLE_ADS_CONVERSION_EVENTS.some(
          (event) => Boolean(conversionId(event)) && isGoogleAdsPending(event),
        )
      ) {
        retry = setTimeout(() => {
          void attempt();
        }, delay);
        delay = Math.min(delay * 2, 30_000);
      }
    };
    void attempt();
    return () => {
      stopped = true;
      clearTimeout(retry);
    };
  }, [consentAccepted, nonce, pathname]);

  return null;
}
