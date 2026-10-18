import {
  hasAcceptedCookieConsent,
  syncGoogleAdsConsent,
  type GtagFn,
} from "./fire-google-ads-conversion";

const SCRIPT_ID = "sajtmaskin-google-ads";
const LOAD_TIMEOUT_MS = 15_000;
let loading: Promise<boolean> | null = null;

const CONSENT_DEFAULT_DENIED = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
  wait_for_update: 500,
} as const;

declare global {
  interface Window {
    sajtmaskinAdsConfiguredIds?: string[];
    sajtmaskinAdsConsentDefaulted?: boolean;
    sajtmaskinAdsJsQueued?: boolean;
  }
}

function ensureGtagQueue(): GtagFn | undefined {
  if (typeof window === "undefined") return undefined;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    // gtag.js dispatches only Arguments objects as commands; a pushed array is
    // read as a GTM method call, so consent/config/event would be dropped.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    } as GtagFn;
  }
  return window.gtag;
}

/** Consent Mode v2 default must land before `js` / `config`. */
export function ensureGoogleAdsConsentDefault(): void {
  const gtag = ensureGtagQueue();
  if (!gtag) return;
  if (!window.sajtmaskinAdsConsentDefaulted) {
    gtag("consent", "default", { ...CONSENT_DEFAULT_DENIED });
    window.sajtmaskinAdsConsentDefaulted = true;
    // Returning visitors already have CMP state. Queue granted before js/config
    // so wait_for_update does not let conversion-linker run as denied.
    if (hasAcceptedCookieConsent()) {
      syncGoogleAdsConsent();
    }
  }
  if (!window.sajtmaskinAdsJsQueued) {
    gtag("js", new Date());
    window.sajtmaskinAdsJsQueued = true;
  }
}

/** A queue shim is not proof that the remote tag loaded. Failed loads can retry. */
export function loadGoogleAdsTag(adsId: string, nonce?: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "true" && existing.dataset.adsId === adsId) {
    window.sajtmaskinAdsTagLoaded = true;
    return Promise.resolve(true);
  }
  if (loading) return loading;
  window.sajtmaskinAdsTagLoaded = false;
  ensureGoogleAdsConsentDefault();
  const gtag = window.gtag;
  // Failed script loads leave the same dataLayer intact. Retry injection,
  // not configuration; keep this per-document identity across module reloads.
  const configuredIds = (window.sajtmaskinAdsConfiguredIds ??= []);
  if (typeof gtag === "function" && !configuredIds.includes(adsId)) {
    gtag("config", adsId);
    configuredIds.push(adsId);
  }
  existing?.remove();
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.dataset.adsId = adsId;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`;
  if (nonce) script.setAttribute("nonce", nonce);
  loading = new Promise<boolean>((resolve) => {
    const finish = (loaded: boolean) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      // A replaced module's timer may settle after the replacement loaded.
      // Only the current script owns the document-wide readiness flag.
      if (document.getElementById(SCRIPT_ID) === script) {
        window.sajtmaskinAdsTagLoaded = loaded;
      }
      if (loaded) script.dataset.loaded = "true";
      else script.remove();
      resolve(loaded);
    };
    const timer = setTimeout(() => finish(false), LOAD_TIMEOUT_MS);
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    try {
      document.head.appendChild(script);
    } catch {
      finish(false);
    }
  }).finally(() => {
    loading = null;
  });
  return loading;
}
