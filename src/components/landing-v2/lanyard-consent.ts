import {
  readLanyardStaticOnly,
  scheduleWhenIdle,
} from "@/components/landing-v2/landing-hooks";

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
 * Startar experience-chunken för återbesökare. 3D/Rapier laddas bara på
 * kapabel desktop, och först vid idle — samma regel som LanyardExperience.
 * Mobil, reduced-motion och Save-Data hoppar över fysikchunken helt.
 */
export function preloadReturningLanyard(): void {
  void import("@/components/landing-v2/lanyard-experience");
  if (!shouldPreloadLanyardCard()) return;
  scheduleWhenIdle(() => {
    void import("@/components/landing-v2/lanyard-card");
  });
}
