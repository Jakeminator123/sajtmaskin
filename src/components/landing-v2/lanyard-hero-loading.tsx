"use client";

import { useSyncExternalStore } from "react";
import {
  getCookieConsentSnapshot,
  subscribeCookieConsent,
} from "@/components/landing-v2/lanyard-consent";
import { StaticLanyardFallback } from "@/components/landing-v2/lanyard-static-fallback";

/**
 * next/dynamic `loading` SSRas även när själva experience är `ssr: false`.
 * Server-snapshot är tom (samma hydrering). Klienten läser localStorage
 * via useSyncExternalStore så återbesökare får det statiska kortet utan
 * setState-i-effect.
 */
export function LanyardHeroLoading() {
  const returning = useSyncExternalStore(
    subscribeCookieConsent,
    getCookieConsentSnapshot,
    () => false,
  );

  if (!returning) {
    return <div className="h-full w-full" aria-hidden="true" data-testid="lanyard-hero-loading" />;
  }

  return <StaticLanyardFallback />;
}
