/**
 * Public marketing origin for Sajtmaskin itself.
 *
 * `NEXT_PUBLIC_APP_URL` / `URLS.baseUrl` follow the current deploy (preview,
 * localhost, Vercel alias). Search signals must not. Indexable URLs, sitemap
 * and robots always name https://sajtmaskin.se so a preview or the historical
 * `sajtmaskin.vercel.app` alias cannot advertise itself as a second site.
 */

export const PUBLIC_CANONICAL_HOST = "sajtmaskin.se";
export const PUBLIC_CANONICAL_ORIGIN = `https://${PUBLIC_CANONICAL_HOST}`;

/**
 * The one production Vercel alias that has been a parallel public host.
 * Git-branch and per-deployment `*.vercel.app` hosts are not in this set.
 */
export const DUPLICATE_PUBLIC_ALIAS_HOSTS = ["sajtmaskin.vercel.app"] as const;

export const PRIVATE_SEARCH_DISALLOW_PATHS = [
  "/api/",
  "/builder",
  "/projects",
  "/konto",
  "/audits",
  "/buy-credits",
  "/avatar",
  "/kostnadsfri",
] as const;

const DUPLICATE_PUBLIC_ALIAS_HOST_SET = new Set<string>(DUPLICATE_PUBLIC_ALIAS_HOSTS);

export function normalizeRequestHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

export function isCanonicalPublicHost(hostname: string): boolean {
  return normalizeRequestHostname(hostname) === PUBLIC_CANONICAL_HOST;
}

export function isDuplicatePublicAliasHost(hostname: string): boolean {
  return DUPLICATE_PUBLIC_ALIAS_HOST_SET.has(normalizeRequestHostname(hostname));
}

/**
 * Machine/registry contracts still published on the Vercel alias. Pages,
 * sitemap and robots redirect; these stay so webhooks, OAuth callbacks and
 * `@sajtmaskin` registry clients are not broken by a 308.
 */
export function shouldRedirectDuplicatePublicPath(pathname: string): boolean {
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  if (pathname === "/r" || pathname.startsWith("/r/")) return false;
  if (pathname === "/.well-known" || pathname.startsWith("/.well-known/")) return false;
  return true;
}

export function publicCanonicalPath(path = ""): string {
  if (!path || path === "/") return PUBLIC_CANONICAL_ORIGIN;
  const rel = path.startsWith("/") ? path : `/${path}`;
  return `${PUBLIC_CANONICAL_ORIGIN}${rel}`;
}

export function publicPageAlternates(path: string): { canonical: string } {
  return { canonical: publicCanonicalPath(path) };
}

/**
 * Only the Vercel production environment is allowed to present an indexable
 * public surface. Preview deploys and local builds stay usable; crawlers are
 * told not to index them.
 */
export function allowsPublicSearchIndexing(
  vercelEnv: string | undefined = process.env.VERCEL_ENV,
): boolean {
  return vercelEnv?.trim().toLowerCase() === "production";
}

export function publicIndexRobots(): { index: boolean; follow: boolean } {
  return allowsPublicSearchIndexing()
    ? { index: true, follow: true }
    : { index: false, follow: false };
}

/**
 * Permanent redirect target for the duplicated production alias.
 * Path and query are kept. Hash is not sent by browsers to the server.
 */
export function canonicalPublicUrlForDuplicateHost(url: URL): URL | null {
  const host = normalizeRequestHostname(url.hostname);
  if (isCanonicalPublicHost(host)) return null;
  if (!isDuplicatePublicAliasHost(host)) return null;
  if (!shouldRedirectDuplicatePublicPath(url.pathname)) return null;

  const canonical = new URL(url.href);
  canonical.protocol = "https:";
  canonical.hostname = PUBLIC_CANONICAL_HOST;
  canonical.port = "";
  if (isCanonicalPublicHost(canonical.hostname) && canonical.hostname === host) {
    return null;
  }
  return canonical;
}
