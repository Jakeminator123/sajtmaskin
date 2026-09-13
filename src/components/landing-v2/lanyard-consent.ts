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
 * Startar experience- och 3D-chunk parallellt för återbesökare så
 * hero-ytan inte väntar på en andra dynamisk import efter mount.
 */
export function preloadReturningLanyard(): void {
  void import("@/components/landing-v2/lanyard-experience");
  if (readStoredCookieConsent()) {
    void import("@/components/landing-v2/lanyard-card");
  }
}
