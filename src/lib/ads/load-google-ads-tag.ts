import type { GtagFn } from "./fire-google-ads-conversion";

const SCRIPT_ID = "sajtmaskin-google-ads";
const LOAD_TIMEOUT_MS = 15_000;
let loading: Promise<boolean> | null = null;

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
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = ((...args: unknown[]) => {
      window.dataLayer?.push(args);
    }) as GtagFn;
    window.gtag("js", new Date());
  }
  window.gtag("config", adsId);
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
      window.sajtmaskinAdsTagLoaded = loaded;
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
