"use client";

import { useEffect, useState } from "react";
import { readStoredCookieConsent } from "@/components/landing-v2/lanyard-consent";
import { StaticLanyardFallback } from "@/components/landing-v2/lanyard-static-fallback";

/**
 * next/dynamic `loading` SSRas även när själva experience är `ssr: false`.
 * Första painten måste därför vara tom (samma server/klient). Efter mount
 * visar återbesökare det statiska kortet så hero-ytan inte gapar tom medan
 * 3D-chunken hämtas.
 */
export function LanyardHeroLoading() {
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    setReturning(Boolean(readStoredCookieConsent()));
  }, []);

  if (!returning) {
    return <div className="h-full w-full" aria-hidden="true" data-testid="lanyard-hero-loading" />;
  }

  return <StaticLanyardFallback />;
}
