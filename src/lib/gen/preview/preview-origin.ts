/**
 * Egen webbläsar-origin per chatt för tier-2-previews (SM-080, M03).
 *
 * Preview-hosten kan (`PREVIEW_HOST_ORIGIN_MODE=subdomain`) servera varje chatt
 * på `https://p-<20 hex>.<domän>/<chatId>` i stället för den delade
 * `https://<host>.fly.dev/<chatId>`. Appen måste känna igen BÅDA formerna
 * oavsett hostens läge: samma host betjänar produktion, staging och lokal dev,
 * så en app som bara känner den ena formen går sönder när flaggan slås om.
 *
 * Matchningen är exakt: bara en enda etikett med hostens slug-mönster under
 * domänen godkänns (inte suffix), så att capture-allowlisten aldrig släpper in
 * godtyckliga värdar under domänen. Speglar
 * `preview-host/src/runtime/preview-origin.js` (paritetstest bredvid).
 */

/**
 * Default när env saknas. Läggs i kod så att en app-deploy räcker för att
 * känna igen domänen; env-nyckeln är bara till för att byta domän.
 */
export const DEFAULT_PREVIEW_ORIGIN_DOMAIN = "vm.sajtmaskin.com";

/** Samma mönster som hostens `PREVIEW_ORIGIN_SLUG_RE`. */
export const PREVIEW_ORIGIN_SLUG_RE = /^p-[0-9a-f]{20}$/;

const HOSTNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function normalizeDomain(raw: string | undefined): string | null {
  const value = raw?.trim().toLowerCase().replace(/^\.+/, "").replace(/\.$/, "") ?? "";
  if (!value || !HOSTNAME_RE.test(value)) return null;
  return value;
}

/**
 * Preview-origin-domänen. Statisk `process.env.NEXT_PUBLIC_…`-referens så att
 * Next inlinar värdet i klientbundeln (en sammansatt nyckel inlinas inte).
 */
export function getPreviewOriginDomain(): string {
  return (
    normalizeDomain(process.env.NEXT_PUBLIC_SAJTMASKIN_PREVIEW_ORIGIN_DOMAIN) ??
    DEFAULT_PREVIEW_ORIGIN_DOMAIN
  );
}

/** Sant för exakt `<slug>.<domän>`, där slug följer hostens mönster. */
export function isPreviewOriginHost(hostname: string | null | undefined): boolean {
  if (typeof hostname !== "string") return false;
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  const suffix = `.${getPreviewOriginDomain()}`;
  if (!host.endsWith(suffix)) return false;
  return PREVIEW_ORIGIN_SLUG_RE.test(host.slice(0, -suffix.length));
}

/** CSP-källa för alla per-chatt-origins (`https://*.<domän>`). */
export function getPreviewOriginCspSource(): string {
  return `https://*.${getPreviewOriginDomain()}`;
}
