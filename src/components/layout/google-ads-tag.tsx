"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  bindAdsClickParamPassthrough,
  captureAdsClickParamsFromLocation,
} from "@/lib/ads/ads-click-params";
import {
  flushPendingGoogleAdsConversions,
  hasAcceptedCookieConsent,
  isGoogleAdsPending,
  noteAccountCreatedFromLocation,
  noteAccountCreatedIfSignup,
  noteBuilderStartFromLocation,
  subscribeCookieConsent,
  syncGoogleAdsConsent,
} from "@/lib/ads/fire-google-ads-conversion";
import {
  getGoogleAdsConfig,
  GOOGLE_ADS_CONVERSION_EVENTS,
  isAdminAppPath,
  isGoogleAdsEnabled,
  isGoogleAdsQueueableEvent,
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const signup = searchParams.get("signup");
  const consentAccepted = useSyncExternalStore(
    subscribeConsent,
    hasAcceptedCookieConsent,
    getServerCookieConsentSnapshot,
  );

  useEffect(() => {
    if (isAdminAppPath(pathname)) return;
    captureAdsClickParamsFromLocation();
    return bindAdsClickParamPassthrough((href) => {
      router.push(href);
    });
  }, [pathname, router]);

  // App Router snapshot — survive child effects that router.replace away signup=1
  // before window.location.search is read. Document URL is the fallback.
  useEffect(() => {
    if (isAdminAppPath(pathname)) return;
    noteAccountCreatedIfSignup(signup);
    noteAccountCreatedFromLocation();
  }, [pathname, signup]);

  useEffect(() => {
    const config = getGoogleAdsConfig();
    if (!isGoogleAdsEnabled(config) || !config.adsId) return;
    if (isAdminAppPath(pathname)) return;

    noteBuilderStartFromLocation(pathname);
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
      if (stopped || isAdminAppPath(window.location.pathname)) return;
      if (loaded) {
        syncGoogleAdsConsent();
        if (hasAcceptedCookieConsent()) {
          flushPendingGoogleAdsConversions();
        }
      }
      const pendingAfterConsent =
        hasAcceptedCookieConsent() &&
        GOOGLE_ADS_CONVERSION_EVENTS.some(
          (event) => isGoogleAdsQueueableEvent(event) && isGoogleAdsPending(event),
        );
      if (!loaded || pendingAfterConsent) {
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
