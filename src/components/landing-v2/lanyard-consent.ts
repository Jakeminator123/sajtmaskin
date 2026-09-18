import { readLanyardStaticOnly } from "@/components/landing-v2/landing-hooks";
import {
  COOKIE_CONSENT_DATE_KEY,
  COOKIE_CONSENT_KEY,
  readStoredCookieConsent,
} from "@/lib/consent/cookie-consent";

export const LANYARD_CONSENT_KEY = COOKIE_CONSENT_KEY;
export const LANYARD_CONSENT_DATE_KEY = COOKIE_CONSENT_DATE_KEY;

export { readStoredCookieConsent };

/** 3D-kortet får bara förladdas när samtycke finns och staticOnly är av. */
export function shouldPreloadLanyardCard(): boolean {
  return Boolean(readStoredCookieConsent()) && !readLanyardStaticOnly();
}

/**
 * Startar experience- och 3D-chunk parallellt för återbesökare så
 * hero-ytan inte väntar på en andra dynamisk import efter mount.
 * Reduced-motion / save-data hoppar över 3D-chunken — samma regel som
 * LanyardExperience.staticOnly.
 */
export function preloadReturningLanyard(): void {
  void import("@/components/landing-v2/lanyard-experience");
  if (!shouldPreloadLanyardCard()) return;
  void import("@/components/landing-v2/lanyard-card");
}
