/**
 * Shared first-party cookie-consent storage.
 *
 * The landing lanyard and the compact banner both persist the same keys so a
 * choice on one surface applies everywhere. Marketing pixels subscribe to the
 * event so Consent Mode can update without a reload.
 */

export type CookieConsentValue = "accepted" | "declined";

export const COOKIE_CONSENT_KEY = "cookie-consent";
export const COOKIE_CONSENT_DATE_KEY = "cookie-consent-date";
export const COOKIE_CONSENT_EVENT = "sajtmaskin:cookie-consent";

export function readStoredCookieConsent(): CookieConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(COOKIE_CONSENT_KEY);
    return value === "accepted" || value === "declined" ? value : null;
  } catch {
    return null;
  }
}

export function hasMarketingConsent(): boolean {
  return readStoredCookieConsent() === "accepted";
}

export function persistCookieConsent(value: CookieConsentValue): void {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
    if (value === "accepted") {
      localStorage.setItem(COOKIE_CONSENT_DATE_KEY, new Date().toISOString());
    }
  } catch {
    /* localStorage kan vara blockerat — skicka eventet ändå. */
  }
  dispatchCookieConsent(value);
}

export function subscribeCookieConsent(
  listener: (value: CookieConsentValue | null) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<CookieConsentValue>).detail;
    listener(detail === "accepted" || detail === "declined" ? detail : readStoredCookieConsent());
  };
  window.addEventListener(COOKIE_CONSENT_EVENT, handler);
  return () => window.removeEventListener(COOKIE_CONSENT_EVENT, handler);
}

function dispatchCookieConsent(value: CookieConsentValue): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: value }));
}
