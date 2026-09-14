import { readLanyardStaticOnly } from "@/components/landing-v2/landing-hooks";

export const LANYARD_CONSENT_KEY = "cookie-consent";
export const LANYARD_CONSENT_DATE_KEY = "cookie-consent-date";

export function readStoredCookieConsent(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LANYARD_CONSENT_KEY);
  } catch {
    return null;
  }
}

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
