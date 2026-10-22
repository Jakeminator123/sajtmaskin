import {
  conversionId,
  GOOGLE_ADS_CONVERSION_EVENTS,
  GOOGLE_ADS_CUSTOM_EVENT_NAMES,
  isAdminAppPath,
  isGoogleAdsEnabled,
  isGoogleAdsQueueableEvent,
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
    sajtmaskinAdsTagLoaded?: boolean;
    /** Document-local fallback only; survives module reload, not navigation reload. */
    sajtmaskinAdsTransientState?: {
      pending: Set<GoogleAdsConversionEvent>;
      claimed: Set<GoogleAdsConversionEvent>;
    };
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

function storageSet(storage: Storage | null, key: string, value: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function transientAdsState() {
  if (typeof window === "undefined") return undefined;
  return window.sajtmaskinAdsTransientState ??= { pending: new Set(), claimed: new Set() };
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
  syncGoogleAdsConsent();
}

export function syncGoogleAdsConsent(): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  const state = hasAcceptedCookieConsent() ? "granted" : "denied";
  try {
    window.gtag("consent", "update", {
      ad_storage: state,
      ad_user_data: state,
      ad_personalization: state,
      analytics_storage: state,
    });
  } catch {
    /* tag may throw before the remote script is ready */
  }
}

export function isGoogleAdsClaimed(event: GoogleAdsConversionEvent): boolean {
  return storageGet(adsStorage(event), claimedKey(event)) === "1" ||
    (typeof window !== "undefined" && window.sajtmaskinAdsTransientState?.claimed.has(event) === true);
}

export function isGoogleAdsPending(event: GoogleAdsConversionEvent): boolean {
  return !isGoogleAdsClaimed(event) && (storageGet(adsStorage(event), pendingKey(event)) === "1" ||
    (typeof window !== "undefined" && window.sajtmaskinAdsTransientState?.pending.has(event) === true));
}

export function noteGoogleAdsConversion(event: GoogleAdsConversionEvent): void {
  if (isGoogleAdsClaimed(event)) return;
  if (!storageSet(adsStorage(event), pendingKey(event), "1")) transientAdsState()?.pending.add(event);
  fireGoogleAdsConversion(event);
}

function canSendGoogleAdsConversion(event: GoogleAdsConversionEvent): boolean {
  if (typeof window === "undefined") return false;
  if (!isGoogleAdsEnabled()) return false;
  if (!isGoogleAdsQueueableEvent(event)) return false;
  if (!hasAcceptedCookieConsent()) return false;
  if (isAdminAppPath(window.location.pathname)) return false;
  if (typeof window.gtag !== "function") return false;
  if (window.sajtmaskinAdsTagLoaded !== true) return false;
  return true;
}

/** Only submit after actual tag load; a local gtag queue shim is not sufficient. */
export function fireGoogleAdsConversion(event: GoogleAdsConversionEvent): boolean {
  if (isGoogleAdsClaimed(event)) {
    if (typeof window !== "undefined") window.sajtmaskinAdsTransientState?.pending.delete(event);
    storageRemove(adsStorage(event), pendingKey(event));
    return false;
  }
  if (!canSendGoogleAdsConversion(event)) return false;
  if (typeof window.gtag !== "function") return false;

  const sendTo = conversionId(event);
  const storage = adsStorage(event);
  try {
    if (sendTo) {
      window.gtag("event", "conversion", { send_to: sendTo });
    } else if (event === "first_generation") {
      window.gtag("event", GOOGLE_ADS_CUSTOM_EVENT_NAMES.first_generation);
    } else {
      return false;
    }
  } catch {
    return false;
  }
  if (!storageSet(storage, claimedKey(event), "1")) transientAdsState()?.claimed.add(event);
  window.sajtmaskinAdsTransientState?.pending.delete(event);
  storageRemove(storage, pendingKey(event));
  return true;
}

export function flushPendingGoogleAdsConversions(): void {
  for (const event of GOOGLE_ADS_CONVERSION_EVENTS) {
    if (isGoogleAdsPending(event)) {
      fireGoogleAdsConversion(event);
    }
  }
}

/** Consent gates gtag, not whether a Google signup is remembered. */
export function noteAccountCreatedIfSignup(signup: string | null): void {
  if (signup === "1") {
    noteGoogleAdsConversion("account_created");
  }
}

export function noteAccountCreatedFromLocation(search: string = window.location.search): void {
  const params = new URLSearchParams(search.startsWith("?") || search.length === 0 ? search : `?${search}`);
  noteAccountCreatedIfSignup(params.get("signup"));
}

const BUILDER_START_HANDOFFS_KEY = `${STORAGE_PREFIX}builder-start-handoffs`;
const MAX_BUILDER_START_HANDOFFS = 40;

function builderStartHandoffId(params: URLSearchParams): string | null {
  const project = params.get("project")?.trim();
  if (project) return `project:${project}`;
  const promptId = params.get("promptId")?.trim();
  if (promptId) return `prompt:${promptId}`;
  return null;
}

function readBuilderStartHandoffs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BUILDER_START_HANDOFFS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rememberBuilderStartHandoff(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = [id, ...readBuilderStartHandoffs().filter((item) => item !== id)].slice(
      0,
      MAX_BUILDER_START_HANDOFFS,
    );
    window.localStorage.setItem(BUILDER_START_HANDOFFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / blocked storage */
  }
}

function stripNotedBuilderStartParam(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.pathname !== "/builder" || url.searchParams.get("new") !== "1") return;
  url.searchParams.delete("new");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

export function noteBuilderStartFromLocation(
  pathname: string,
  search: string = window.location.search,
): void {
  if (pathname !== "/builder") return;
  const params = new URLSearchParams(search.startsWith("?") || search.length === 0 ? search : `?${search}`);
  if (params.get("new") !== "1") return;
  const handoffId = builderStartHandoffId(params);
  if (!handoffId || !readBuilderStartHandoffs().includes(handoffId)) {
    noteGoogleAdsConversion("builder_start");
    if (handoffId) rememberBuilderStartHandoff(handoffId);
  }
  stripNotedBuilderStartParam();
}
