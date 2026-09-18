import {
  conversionId,
  GOOGLE_ADS_CONVERSION_EVENTS,
  isAdminAppPath,
  isGoogleAdsEnabled,
  type GoogleAdsConversionEvent,
} from "@/lib/ads/google-ads";

export const COOKIE_CONSENT_KEY = "cookie-consent";
export const COOKIE_CONSENT_CHANGE_EVENT = "sajtmaskin:cookie-consent";

const STORAGE_PREFIX = "sajtmaskin:ads:";

export type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

function adsStorage(event: GoogleAdsConversionEvent): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return event === "builder_start" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function pendingKey(event: GoogleAdsConversionEvent): string {
  return `${STORAGE_PREFIX}pending:${event}`;
}

function claimedKey(event: GoogleAdsConversionEvent): string {
  return `${STORAGE_PREFIX}claimed:${event}`;
}

function storageGet(storage: Storage | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(storage: Storage | null, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    /* ignore quota / blocked storage */
  }
}

function storageRemove(storage: Storage | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function hasAcceptedCookieConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}

export function subscribeCookieConsent(onChange: (accepted: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const emit = () => onChange(hasAcceptedCookieConsent());
  const onConsent = (event: Event) => {
    const detail = (event as CustomEvent<string>).detail;
    if (detail === "accepted" || detail === "declined") {
      onChange(detail === "accepted");
      return;
    }
    emit();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== COOKIE_CONSENT_KEY) return;
    emit();
  };

  window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, onConsent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onConsent);
    window.removeEventListener("storage", onStorage);
  };
}

export function dispatchCookieConsentChange(value: "accepted" | "declined"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGE_EVENT, { detail: value }));
}

export function isGoogleAdsClaimed(event: GoogleAdsConversionEvent): boolean {
  return storageGet(adsStorage(event), claimedKey(event)) === "1";
}

export function isGoogleAdsPending(event: GoogleAdsConversionEvent): boolean {
  return storageGet(adsStorage(event), pendingKey(event)) === "1";
}

export function noteGoogleAdsConversion(event: GoogleAdsConversionEvent): void {
  if (isGoogleAdsClaimed(event)) return;
  storageSet(adsStorage(event), pendingKey(event), "1");
  fireGoogleAdsConversion(event);
}

function canSendGoogleAdsConversion(event: GoogleAdsConversionEvent): boolean {
  if (typeof window === "undefined") return false;
  if (!isGoogleAdsEnabled()) return false;
  if (!conversionId(event)) return false;
  if (!hasAcceptedCookieConsent()) return false;
  if (isAdminAppPath(window.location.pathname)) return false;
  if (typeof window.gtag !== "function") return false;
  return true;
}

/** No-op unless the account tag, event label, consent and `window.gtag` are all present. */
export function fireGoogleAdsConversion(event: GoogleAdsConversionEvent): boolean {
  if (isGoogleAdsClaimed(event)) {
    storageRemove(adsStorage(event), pendingKey(event));
    return false;
  }
  if (!canSendGoogleAdsConversion(event)) return false;

  const sendTo = conversionId(event);
  if (!sendTo || typeof window.gtag !== "function") return false;

  const storage = adsStorage(event);
  storageSet(storage, claimedKey(event), "1");
  storageRemove(storage, pendingKey(event));
  window.gtag("event", "conversion", { send_to: sendTo });
  return true;
}

export function flushPendingGoogleAdsConversions(): void {
  for (const event of GOOGLE_ADS_CONVERSION_EVENTS) {
    if (isGoogleAdsPending(event)) {
      fireGoogleAdsConversion(event);
    }
  }
}

export function noteAccountCreatedFromLocation(search: string = window.location.search): void {
  const params = new URLSearchParams(search.startsWith("?") || search.length === 0 ? search : `?${search}`);
  if (params.get("signup") === "1") {
    noteGoogleAdsConversion("account_created");
  }
}

export function noteBuilderStartFromLocation(
  pathname: string,
  search: string = window.location.search,
): void {
  if (pathname !== "/builder") return;
  const params = new URLSearchParams(search.startsWith("?") || search.length === 0 ? search : `?${search}`);
  if (params.get("new") === "1") {
    noteGoogleAdsConversion("builder_start");
  }
}
