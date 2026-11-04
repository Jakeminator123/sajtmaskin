"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import {
  hasAcceptedCookieConsent,
  subscribeCookieConsent,
} from "@/lib/ads/fire-google-ads-conversion";

const subscribeConsent = (onChange: () => void) => subscribeCookieConsent(onChange);
const getServerConsent = () => false;

/**
 * Analytics Tracker Component
 *
 * Records page views when the user navigates to different pages.
 * Include this component in your root layout to track all page visits.
 */
export function AnalyticsTracker() {
  const pathname = usePathname();
  const consentAccepted = useSyncExternalStore(
    subscribeConsent,
    hasAcceptedCookieConsent,
    getServerConsent,
  );
  const canTrack = consentAccepted && !pathname.startsWith("/admin") && !pathname.startsWith("/api");

  useEffect(() => {
    // Don't track admin pages or API routes
    if (!canTrack || !hasAcceptedCookieConsent()) {
      return;
    }

    // Record the page view
    const trackPageView = async () => {
      try {
        await fetch("/api/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: pathname,
            referrer: document.referrer || null,
          }),
        });
      } catch {
        // Silently fail - don't interrupt user experience
      }
    };

    trackPageView();
  }, [pathname, canTrack]);

  if (!canTrack) return null;
  return (
    <>
      <Analytics beforeSend={(event) => hasAcceptedCookieConsent() ? event : null} />
      <SpeedInsights beforeSend={(event) => hasAcceptedCookieConsent() ? event : null} />
    </>
  );
}
