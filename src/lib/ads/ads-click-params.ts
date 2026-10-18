/**
 * Keep Google Ads click identifiers across in-app navigation without cookies.
 *
 * Consent Mode + Next.js client routing drops `gclid` unless we copy it onto
 * `/builder`. sessionStorage only — never `document.cookie` before consent.
 */

export const ADS_CLICK_PARAMS_STORAGE_KEY = "sajtmaskin:ads:click-params";

export const ADS_CLICK_PARAM_KEYS = [
  "gclid",
  "wbraid",
  "gbraid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type AdsClickParamKey = (typeof ADS_CLICK_PARAM_KEYS)[number];
export type AdsClickParams = Partial<Record<AdsClickParamKey, string>>;

const MAX_VALUE_LENGTH = 200;
const KEY_SET = new Set<string>(ADS_CLICK_PARAM_KEYS);
const CLICK_ID_KEYS = ["gclid", "wbraid", "gbraid"] as const;
const CLICK_ID_KEY_SET = new Set<string>(CLICK_ID_KEYS);

function sessionStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function sanitizeAdsClickValue(key: string, value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_VALUE_LENGTH) return null;
  if (CLICK_ID_KEY_SET.has(key)) {
    if (/[\s\r\n]/.test(trimmed)) return null;
    return trimmed;
  }
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

function pickAdsClickParams(search: URLSearchParams): AdsClickParams {
  const picked: AdsClickParams = {};
  for (const key of ADS_CLICK_PARAM_KEYS) {
    const value = sanitizeAdsClickValue(key, search.get(key));
    if (value) picked[key] = value;
  }
  return picked;
}

function isAdsClickParams(value: unknown): value is AdsClickParams {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([key, item]) =>
      KEY_SET.has(key) && typeof item === "string" && sanitizeAdsClickValue(key, item) === item,
  );
}

export function readStoredAdsClickParams(): AdsClickParams {
  const storage = sessionStore();
  if (!storage) return {};
  try {
    const raw = storage.getItem(ADS_CLICK_PARAMS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isAdsClickParams(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredAdsClickParams(params: AdsClickParams): void {
  const storage = sessionStore();
  if (!storage) return;
  if (Object.keys(params).length === 0) return;
  try {
    storage.setItem(ADS_CLICK_PARAMS_STORAGE_KEY, JSON.stringify(params));
  } catch {
    /* ignore quota / blocked storage */
  }
}

function hasStoredClickId(params: AdsClickParams): boolean {
  return CLICK_ID_KEYS.some((key) => Boolean(params[key]));
}

function readSameOriginReferrerClickIds(): AdsClickParams {
  if (typeof window === "undefined" || typeof document === "undefined") return {};
  const referrer = document.referrer;
  if (!referrer) return {};
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return {};
  }
  if (url.origin !== window.location.origin) return {};
  const picked: AdsClickParams = {};
  for (const key of CLICK_ID_KEYS) {
    const value = sanitizeAdsClickValue(key, url.searchParams.get(key));
    if (value) picked[key] = value;
  }
  return picked;
}

export function captureAdsClickParamsFromLocation(
  search: string = typeof window === "undefined" ? "" : window.location.search,
): AdsClickParams {
  const incoming = pickAdsClickParams(
    new URLSearchParams(search.startsWith("?") || search.length === 0 ? search : `?${search}`),
  );
  let merged = { ...readStoredAdsClickParams(), ...incoming };
  if (
    typeof window !== "undefined" &&
    window.location.pathname === "/builder" &&
    !hasStoredClickId(merged)
  ) {
    merged = { ...merged, ...readSameOriginReferrerClickIds() };
  }
  writeStoredAdsClickParams(merged);
  return merged;
}

export function applyAdsClickParams(params: URLSearchParams): URLSearchParams {
  const stored = captureAdsClickParamsFromLocation();
  for (const key of ADS_CLICK_PARAM_KEYS) {
    const value = stored[key];
    if (value && !params.get(key)) params.set(key, value);
  }
  return params;
}

function builderPath(href: string): string | null {
  if (!href || href.startsWith("//") || /^[a-zA-Z][a-zA-Z+.-]*:/.test(href)) return null;
  const path = href.split(/[?#]/, 1)[0];
  return path === "/builder" ? path : null;
}

export function isInternalBuilderHref(href: string): boolean {
  return builderPath(href) !== null;
}

export function appendAdsClickParams(href: string): string {
  if (!isInternalBuilderHref(href)) return href;
  const dummy = new URL(href, "https://sajtmaskin.local");
  applyAdsClickParams(dummy.searchParams);
  const search = dummy.searchParams.toString();
  return `${dummy.pathname}${search ? `?${search}` : ""}${dummy.hash}`;
}

export function toBuilderStartHref(
  from: URLSearchParams | Record<string, string> = {},
): string {
  const params =
    from instanceof URLSearchParams ? new URLSearchParams(from) : new URLSearchParams(from);
  params.set("new", "1");
  applyAdsClickParams(params);
  return `/builder?${params.toString()}`;
}

function isModifiedBuilderClick(event: MouseEvent): boolean {
  return (
    event.type !== "click" ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

export function bindAdsClickParamPassthrough(navigate: (href: string) => void): () => void {
  if (typeof document === "undefined") return () => {};
  captureAdsClickParamsFromLocation();
  const decorate = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a");
    if (!anchor) return;
    const raw = anchor.getAttribute("href");
    if (!raw || !isInternalBuilderHref(raw)) return;
    const next = appendAdsClickParams(raw);
    if (next === raw) return;
    if (isModifiedBuilderClick(event)) {
      anchor.setAttribute("href", next);
      return;
    }
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    navigate(next);
  };
  const onMiddleMouseDown = (event: MouseEvent) => {
    if (event.button !== 1) return;
    decorate(event);
  };
  document.addEventListener("click", decorate, true);
  document.addEventListener("auxclick", decorate, true);
  document.addEventListener("mousedown", onMiddleMouseDown, true);
  return () => {
    document.removeEventListener("click", decorate, true);
    document.removeEventListener("auxclick", decorate, true);
    document.removeEventListener("mousedown", onMiddleMouseDown, true);
  };
}
