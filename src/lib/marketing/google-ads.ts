import { isAffirmativeEnvValue, sanitizeEnvString } from "@/lib/env-affirmative";
import {
  hasMarketingConsent,
  subscribeCookieConsent,
} from "@/lib/consent/cookie-consent";

export const GOOGLE_ADS_DEFAULT_ID = "AW-18458823435";
export const GOOGLE_ADS_ACCOUNT_CREATED_SEND_TO = "AW-18458823435/R5rICIPf1fscEIuW7eFE";
export const GOOGLE_ADS_BUILDER_START_SEND_TO = "AW-18458823435/yesaCIbf1fscEIuW7eFE";

export const GOOGLE_ADS_PRODUCTION_HOSTS = [
  "sajtmaskin.se",
  "www.sajtmaskin.se",
  "sajtmaskin.com",
  "www.sajtmaskin.com",
  "sajtmaskin.vercel.app",
] as const;

export type GoogleAdsConversionEvent = "account_created" | "builder_start";

const DISABLED_FLAGS = new Set(["0", "false", "no", "off", "n"]);
const CONVERSION_DEDUPE_KEY = "sajtmaskin:google-ads:conversions";

type GtagFn = (...args: unknown[]) => void;

type GoogleAdsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: GtagFn;
};

let tagInstalled = false;
let unsubscribeConsent: (() => void) | null = null;
const pendingConversions: Array<{ event: GoogleAdsConversionEvent; sendTo: string }> = [];
let flushTimer: number | null = null;

export function getGoogleAdsId(): string {
  return sanitizeEnvString(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID) ?? GOOGLE_ADS_DEFAULT_ID;
}

export function getGoogleAdsSendTo(event: GoogleAdsConversionEvent): string {
  if (event === "account_created") {
    return (
      sanitizeEnvString(process.env.NEXT_PUBLIC_GOOGLE_ADS_ACCOUNT_CREATED) ??
      GOOGLE_ADS_ACCOUNT_CREATED_SEND_TO
    );
  }
  return (
    sanitizeEnvString(process.env.NEXT_PUBLIC_GOOGLE_ADS_BUILDER_START) ??
    GOOGLE_ADS_BUILDER_START_SEND_TO
  );
}

export function isGoogleAdsProductionHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  return (GOOGLE_ADS_PRODUCTION_HOSTS as readonly string[]).includes(host);
}

export function isGoogleAdsEnabled(hostname?: string): boolean {
  const flag = sanitizeEnvString(process.env.NEXT_PUBLIC_GOOGLE_ADS_ENABLED)?.toLowerCase();
  if (flag && DISABLED_FLAGS.has(flag)) return false;
  if (!getGoogleAdsId().startsWith("AW-")) return false;
  if (flag && isAffirmativeEnvValue(flag)) return true;
  return hostname ? isGoogleAdsProductionHost(hostname) : false;
}

export function googleAdsScriptSrc(id = getGoogleAdsId()): string {
  return `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
}

export function ensureGoogleAdsTag(options: { nonce?: string; hostname?: string } = {}): boolean {
  if (typeof window === "undefined") return false;
  const hostname = options.hostname ?? window.location.hostname;
  if (!isGoogleAdsEnabled(hostname)) return false;

  const adsWindow = window as GoogleAdsWindow;
  if (!tagInstalled) {
    tagInstalled = true;
    adsWindow.dataLayer = adsWindow.dataLayer ?? [];
    adsWindow.gtag =
      adsWindow.gtag ??
      function gtag() {
        // Official gtag bootstrap uses `arguments` so the downloaded script
        // can drain the same queue shape as Google's snippet.
        // eslint-disable-next-line prefer-rest-params
        adsWindow.dataLayer?.push(arguments);
      };
    adsWindow.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      wait_for_update: 500,
    });
    adsWindow.gtag("js", new Date());
    adsWindow.gtag("config", getGoogleAdsId());

    if (!document.querySelector(`script[src="${googleAdsScriptSrc()}"]`)) {
      const script = document.createElement("script");
      script.async = true;
      script.src = googleAdsScriptSrc();
      if (options.nonce) script.nonce = options.nonce;
      document.head.appendChild(script);
    }
  }

  syncGoogleAdsConsent();
  if (!unsubscribeConsent) {
    unsubscribeConsent = subscribeCookieConsent(() => syncGoogleAdsConsent());
  }
  flushPendingConversions();
  return true;
}

export function syncGoogleAdsConsent(): void {
  if (typeof window === "undefined") return;
  const gtag = (window as GoogleAdsWindow).gtag;
  if (typeof gtag !== "function") return;
  const state = hasMarketingConsent() ? "granted" : "denied";
  gtag("consent", "update", {
    ad_storage: state,
    ad_user_data: state,
    ad_personalization: state,
    analytics_storage: state,
  });
}

export function trackGoogleAdsConversion(event: GoogleAdsConversionEvent): boolean {
  if (typeof window === "undefined") return false;
  if (!isGoogleAdsEnabled(window.location.hostname)) return false;
  const sendTo = getGoogleAdsSendTo(event);
  if (!sendTo) return false;
  if (hasFiredConversion(event)) return false;
  markFiredConversion(event);
  pendingConversions.push({ event, sendTo });
  flushPendingConversions();
  return true;
}

export function resetGoogleAdsTagForTests(): void {
  tagInstalled = false;
  unsubscribeConsent?.();
  unsubscribeConsent = null;
  pendingConversions.length = 0;
  if (flushTimer != null) {
    window.clearInterval(flushTimer);
    flushTimer = null;
  }
  if (typeof window !== "undefined") {
    delete (window as GoogleAdsWindow).gtag;
    delete (window as GoogleAdsWindow).dataLayer;
  }
}

function flushPendingConversions(): void {
  if (typeof window === "undefined") return;
  const gtag = (window as GoogleAdsWindow).gtag;
  if (typeof gtag !== "function") {
    scheduleFlush();
    return;
  }
  while (pendingConversions.length > 0) {
    const next = pendingConversions.shift();
    if (!next) break;
    gtag("event", "conversion", {
      send_to: next.sendTo,
      value: 1.0,
      currency: "SEK",
    });
  }
  if (flushTimer != null) {
    window.clearInterval(flushTimer);
    flushTimer = null;
  }
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  let attempts = 0;
  flushTimer = window.setInterval(() => {
    attempts += 1;
    if (typeof (window as GoogleAdsWindow).gtag === "function" || attempts >= 20) {
      flushPendingConversions();
    }
  }, 250);
}

function hasFiredConversion(event: GoogleAdsConversionEvent): boolean {
  return readFiredConversions().has(event);
}

function markFiredConversion(event: GoogleAdsConversionEvent): void {
  const fired = readFiredConversions();
  fired.add(event);
  try {
    localStorage.setItem(CONVERSION_DEDUPE_KEY, JSON.stringify([...fired]));
  } catch {
    /* private mode — in-memory pending list still dedupes this page */
  }
}

function readFiredConversions(): Set<string> {
  try {
    const raw = localStorage.getItem(CONVERSION_DEDUPE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((item) => typeof item === "string")) : new Set();
  } catch {
    return new Set();
  }
}
