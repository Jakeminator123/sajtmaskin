import { isAffirmativeEnvValue, sanitizeEnvString } from "@/lib/env-affirmative";
import { isAdminAppPath, isGoogleAdsProductionHost } from "@/lib/ads/google-ads";

/** Public ChatGPT Ads pixel id. Not a secret. */
export const OPENAI_ADS_DEFAULT_PIXEL_ID = "Y9zJZ4cVRrgfMzr329kAtn";
export const OPENAI_ADS_SDK_URL = "https://bzrcdn.openai.com/sdk/oaiq.min.js";
export const OPENAI_ADS_SCRIPT_ID = "sajtmaskin-openai-ads";

export const OPENAI_ADS_EVENTS = ["registration_completed", "order_created"] as const;
export type OpenAiAdsEvent = (typeof OPENAI_ADS_EVENTS)[number];
export type OpenAiAdsFn = ((...args: unknown[]) => void) & { q?: IArguments[] };

declare global {
  interface Window {
    oaiq?: OpenAiAdsFn;
    sajtmaskinOpenAiAdsTagLoaded?: boolean;
    sajtmaskinOpenAiAdsInitializedId?: string;
  }
}

const PIXEL_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const DISABLED_FLAGS = new Set(["0", "false", "no", "off", "n"]);

export interface OpenAiAdsConfig {
  pixelId: string | null;
}

function parsePixelId(raw: string | undefined): string | null {
  const value = sanitizeEnvString(raw);
  if (!value) return OPENAI_ADS_DEFAULT_PIXEL_ID;
  return PIXEL_ID_RE.test(value) ? value : null;
}

export function parseOpenAiAdsEnv(input: { pixelId?: string }): OpenAiAdsConfig {
  return { pixelId: parsePixelId(input.pixelId) };
}

/**
 * Public Ads env is inlined at build. Read via static `process.env.NEXT_PUBLIC_*`
 * so Next can replace the keys; do not index `process.env` dynamically.
 */
export function getOpenAiAdsConfig(): OpenAiAdsConfig {
  return parseOpenAiAdsEnv({
    pixelId: process.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID,
  });
}

function resolveAdsHostname(hostname?: string): string | undefined {
  if (hostname) return hostname;
  if (typeof window !== "undefined") return window.location.hostname;
  return undefined;
}

/**
 * Kill-switch `NEXT_PUBLIC_OPENAI_ADS_ENABLED=0` always wins.
 * `=1` turns the pixel on for QA on preview/localhost.
 * Otherwise the pixel is on only for production hosts. Preview/localhost stay off.
 */
export function isOpenAiAdsEnabled(
  config: OpenAiAdsConfig = getOpenAiAdsConfig(),
  hostname?: string,
): boolean {
  const flag = sanitizeEnvString(process.env.NEXT_PUBLIC_OPENAI_ADS_ENABLED)?.toLowerCase();
  if (flag && DISABLED_FLAGS.has(flag)) return false;
  if (!config.pixelId) return false;
  if (flag && isAffirmativeEnvValue(flag)) return true;
  const host = resolveAdsHostname(hostname);
  return host ? isGoogleAdsProductionHost(host) : false;
}

export { isAdminAppPath };

/** Official base tag plus consent-denied before init. Never sets `debug`. */
export function openAiAdsBootstrapSource(pixelId: string): string {
  return [
    `!function(w,d,s,u){if(w.oaiq)return;var q=function(){q.q.push(arguments)};q.q=[];w.oaiq=q;var j=d.createElement(s);j.async=1;j.src=u;var f=d.getElementsByTagName(s)[0];f.parentNode.insertBefore(j,f)}(window,document,"script",${JSON.stringify(OPENAI_ADS_SDK_URL)});`,
    `oaiq("consent",false);`,
    `oaiq("init",{pixelId:${JSON.stringify(pixelId)}});`,
  ].join("");
}
