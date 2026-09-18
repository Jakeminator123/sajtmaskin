"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  ensureGoogleAdsTag,
  isGoogleAdsEnabled,
  trackGoogleAdsConversion,
} from "@/lib/marketing/google-ads";

/**
 * Loads the Google Ads tag with Consent Mode v2 and fires the two
 * conversion actions from Google's setup mail:
 * - account_created after a new signup (`?signup=1` or the auth modal)
 * - builder_start on the first `/builder` visit in this browser
 */
export function GoogleAdsTag({ nonce }: { nonce?: string }) {
  const pathname = usePathname();

  useEffect(() => {
    ensureGoogleAdsTag({ nonce, hostname: window.location.hostname });
  }, [nonce]);

  useEffect(() => {
    if (!isGoogleAdsEnabled(window.location.hostname)) return;
    if (pathname.startsWith("/builder")) {
      trackGoogleAdsConversion("builder_start");
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("signup") === "1") {
      trackGoogleAdsConversion("account_created");
    }
  }, [pathname]);

  return null;
}
