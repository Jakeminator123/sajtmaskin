import {
  OPENAI_ADS_SCRIPT_ID,
  OPENAI_ADS_SDK_URL,
  type OpenAiAdsFn,
} from "./openai-ads";
import { hasAcceptedCookieConsent } from "./fire-google-ads-conversion";

const LOAD_TIMEOUT_MS = 15_000;
let loading: Promise<boolean> | null = null;

function ensureOaiqQueue(): OpenAiAdsFn | undefined {
  if (typeof window === "undefined") return undefined;
  if (typeof window.oaiq !== "function") {
    const queue: IArguments[] = [];
    const q = function oaiq() {
      // eslint-disable-next-line prefer-rest-params
      queue.push(arguments);
    } as OpenAiAdsFn;
    q.q = queue;
    window.oaiq = q;
  }
  window.oaiq.q ??= [];
  return window.oaiq;
}

/** Consent must be denied before the first `init`. Never pass `debug`. */
export function ensureOpenAiAdsInitialized(pixelId: string): void {
  const oaiq = ensureOaiqQueue();
  if (!oaiq) return;
  if (window.sajtmaskinOpenAiAdsInitializedId === pixelId) return;
  oaiq("consent", false);
  oaiq("init", { pixelId });
  window.sajtmaskinOpenAiAdsInitializedId = pixelId;
  if (hasAcceptedCookieConsent()) {
    oaiq("consent", true);
  }
}

/** A queue shim is not proof that the remote tag loaded. Failed loads can retry. */
export function loadOpenAiAdsTag(pixelId: string, nonce?: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const existing = document.getElementById(OPENAI_ADS_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "true" && existing.dataset.pixelId === pixelId) {
    window.sajtmaskinOpenAiAdsTagLoaded = true;
    ensureOpenAiAdsInitialized(pixelId);
    return Promise.resolve(true);
  }
  if (loading) return loading;
  window.sajtmaskinOpenAiAdsTagLoaded = false;
  ensureOpenAiAdsInitialized(pixelId);
  existing?.remove();
  const script = document.createElement("script");
  script.id = OPENAI_ADS_SCRIPT_ID;
  script.dataset.pixelId = pixelId;
  script.async = true;
  script.src = OPENAI_ADS_SDK_URL;
  if (nonce) script.setAttribute("nonce", nonce);
  loading = new Promise<boolean>((resolve) => {
    const finish = (loaded: boolean) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (document.getElementById(OPENAI_ADS_SCRIPT_ID) === script) {
        window.sajtmaskinOpenAiAdsTagLoaded = loaded;
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
