/**
 * Vilka URL:er en server-side Chromium får fotografera.
 *
 * Låg tidigare bara i thumbnail-routen. När inspector-capture blev verklig i
 * prod (den var 503-spärrad förut) ärvde den startpunkten men inte den här
 * grinden, och blev därmed en publik screenshot-proxy: protokoll- och
 * SSRF-kontrollen släpper igenom varje PUBLIK värd, och slutkontrollen pinnade
 * bara mot den värd anroparen själv valt. En delad ägare i stället för två
 * kopior — nästa capture-yta ärver skyddet i stället för att sakna det.
 */

import { getPreviewHostBaseUrl } from "@/lib/gen/preview/tier2-config";

function normalizePathPrefix(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function pathIsUnderPrefix(pathname: string, prefix: string): boolean {
  if (prefix === "/") return true;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\./, "").replace(/\.$/, "");
}

/**
 * Extra allowlist-poster matchas som EXAKTA värdnamn, aldrig som suffix.
 * Env-variabeln är en suffixlista för klientens iframe-detektering, men ett
 * suffix som det dokumenterade "fly.dev" täcker varje publik *.fly.dev-app — en
 * angriparkontrollerad Fly-app hade klarat en suffixmatchning och nått den
 * server-side Chromium-capturen (Codex P1 på PR #435). Operatörer med flera
 * preview-värdar får lista varje exakt värdnamn.
 *
 * Icke-ASCII-värdar måste skrivas i punycode: `URL` normaliserar `target`
 * dithän, så en literal IDN-post här matchar aldrig.
 */
function configuredPreviewAllowlistHosts(): string[] {
  const raw = process.env.NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => normalizeHostname(entry))
    .filter(Boolean);
}

export type PreviewAllowlistDecision =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Begränsa anroparangivna preview-URL:er till den konfigurerade
 * preview-host-originen (+ path-prefix), med en explicit operatörslista av
 * exakta alternativa värdnamn.
 */
export function assertPreviewUrlAllowed(
  target: URL,
  label = "capture",
): PreviewAllowlistDecision {
  const previewHostBase = getPreviewHostBaseUrl();
  if (!previewHostBase) {
    return {
      ok: false,
      status: 503,
      error: `${label} är inte konfigurerad (saknar preview-host-bas).`,
    };
  }

  let previewHostBaseUrl: URL;
  try {
    previewHostBaseUrl = new URL(previewHostBase);
  } catch {
    return {
      ok: false,
      status: 503,
      error: `${label} är inte konfigurerad (ogiltig preview-host-bas).`,
    };
  }

  const sameOrigin = target.origin === previewHostBaseUrl.origin;
  const requiredPathPrefix = normalizePathPrefix(previewHostBaseUrl.pathname);
  if (sameOrigin && pathIsUnderPrefix(target.pathname, requiredPathPrefix)) {
    return { ok: true };
  }

  const targetHost = normalizeHostname(target.hostname);
  if (configuredPreviewAllowlistHosts().some((host) => host === targetHost)) {
    return { ok: true };
  }

  return {
    ok: false,
    status: 403,
    error: `Otillåten preview-URL för ${label}.`,
  };
}

/** Klarar `url` både protokollkravet och allowlisten? */
export function isAllowedCaptureUrl(url: URL, label?: string): boolean {
  return ["http:", "https:"].includes(url.protocol) && assertPreviewUrlAllowed(url, label).ok;
}
