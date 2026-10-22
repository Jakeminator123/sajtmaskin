"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  hasAcceptedCookieConsent,
  subscribeCookieConsent,
} from "@/lib/ads/fire-google-ads-conversion";
import {
  flushPendingOpenAiAdsEvents,
  hasPendingOpenAiAdsEvents,
  noteOpenAiRegistrationFromLocation,
  syncOpenAiAdsConsent,
} from "@/lib/ads/fire-openai-ads";
import { getOpenAiAdsConfig, isAdminAppPath, isOpenAiAdsEnabled } from "@/lib/ads/openai-ads";
import { loadOpenAiAdsTag } from "@/lib/ads/load-openai-ads-tag";

function getServerCookieConsentSnapshot(): boolean {
  return false;
}

function subscribeConsent(onStoreChange: () => void): () => void {
  return subscribeCookieConsent(() => {
    onStoreChange();
  });
}

export function OpenAiAdsTag({ nonce }: { nonce?: string }) {
  const pathname = usePathname();
  const consentAccepted = useSyncExternalStore(
    subscribeConsent,
    hasAcceptedCookieConsent,
    getServerCookieConsentSnapshot,
  );

  useEffect(() => {
    const config = getOpenAiAdsConfig();
    if (!isOpenAiAdsEnabled(config) || !config.pixelId) return;
    if (isAdminAppPath(pathname)) return;

    noteOpenAiRegistrationFromLocation();
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1_000;
    const pixelId = config.pixelId;
    const attempt = async () => {
      let loaded = false;
      try {
        loaded = await loadOpenAiAdsTag(pixelId, nonce);
      } catch {
        /* retry, never claim */
      }
      if (stopped || isAdminAppPath(window.location.pathname)) return;
      if (loaded) {
        syncOpenAiAdsConsent();
        if (hasAcceptedCookieConsent()) {
          flushPendingOpenAiAdsEvents();
        }
      }
      const pendingAfterConsent = hasAcceptedCookieConsent() && hasPendingOpenAiAdsEvents();
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
