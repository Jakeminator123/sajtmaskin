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

/**
 * 3D-kortet förladdas bara när staticOnly är av. Samtycket styr det inte:
 * kortet sätter inga cookies, och samtycket bor i den globala cookie-remsan.
 */
export function shouldPreloadLanyardCard(): boolean {
  return !readLanyardStaticOnly();
}

/**
 * Startar experience-chunken. 3D/Rapier laddas bara på kapabel desktop, och
 * först vid idle — samma regel som LanyardExperience. Mobil, reduced-motion
 * och Save-Data hoppar över fysikchunken helt.
 */
export function preloadReturningLanyard(): void {
  void import("@/components/landing-v2/lanyard-experience");
  if (!shouldPreloadLanyardCard()) return;
  scheduleWhenIdle(() => {
    void import("@/components/landing-v2/lanyard-card");
  });
}
