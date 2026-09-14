import { getAppBaseUrl } from "@/lib/app-url";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * These receivers authenticate the sender with a route-owned signature or
 * secret. They are intentionally independent of browser Origin headers.
 */
const EXTERNAL_MACHINE_ENDPOINTS = new Set([
  "/api/drains/vercel",
  "/api/stripe/webhook",
  "/api/webhooks/openai",
  "/api/webhooks/v0",
  "/api/webhooks/vercel",
]);

/**
 * Stable first-party entrypoints. Dynamic Vercel previews and local
 * development are added from their existing configuration owners below.
 */
const PORTAL_ORIGINS = [
  "https://sajtmaskin.se",
  "https://www.sajtmaskin.se",
  "https://sajtmaskin.com",
  "https://www.sajtmaskin.com",
  "https://preview.sajtmaskin.se",
  "https://sajtmaskin.vercel.app",
] as const;

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type PortalOriginSources = {
  appBaseUrl?: string | null;
  nodeEnv?: string | null;
  oauthAllowedOrigins?: string | null;
  vercelBranchUrl?: string | null;
  vercelUrl?: string | null;
};

export type MutationOriginDecision =
  | { allowed: true; source: "origin" | "referer" | "same-origin-fetch" | "machine" }
  | {
      allowed: false;
      reason:
        | "origin_malformed"
        | "origin_not_allowed"
        | "referer_malformed"
        | "referer_not_allowed"
        | "browser_origin_missing";
    };

function parseConfiguredOrigin(value: string): string | null {
  const candidate = value.trim();
  if (!candidate || candidate.includes("*")) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;

    const isLocalHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname.endsWith(".localhost") ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]");
    if (url.protocol !== "https:" && !isLocalHttp) return null;

    return url.origin;
  } catch {
    return null;
  }
}

function parseVercelSystemHostname(value: string): string | null {
  const hostname = value.trim().toLowerCase();
  if (!hostname || hostname.includes("*")) return null;

  try {
    const url = new URL(`https://${hostname}`);
    if (url.origin !== `https://${hostname}`) return null;
    if (!url.hostname.endsWith(".vercel.app")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function addConfiguredLoopbackAliases(
  origins: Set<string>,
  appBaseUrl: string | null | undefined,
  nodeEnv: string | null | undefined,
): void {
  if (nodeEnv === "production" || !appBaseUrl) return;

  const appOrigin = parseConfiguredOrigin(appBaseUrl);
  if (!appOrigin) return;

  const url = new URL(appOrigin);
  if (url.protocol !== "http:" || !LOOPBACK_HOSTNAMES.has(url.hostname)) return;

  const port = url.port ? `:${url.port}` : "";
  origins.add(`http://localhost${port}`);
  origins.add(`http://127.0.0.1${port}`);
  origins.add(`http://[::1]${port}`);
}

/** Origin headers use the serialized-origin form, without paths or a slash. */
function parseOriginHeader(value: string): string | null {
  const parsed = parseConfiguredOrigin(value);
  return parsed && value === parsed ? parsed : null;
}

function refererOrigin(value: string): string | null {
  if (!value || value.includes("*")) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Exact origins already owned by app URL, OAuth, and Vercel configuration.
 * Request Host is deliberately absent: a customer hostname can never appoint
 * itself as trusted by addressing the portal through that Host value.
 */
export function getTrustedPortalOrigins(
  sources: PortalOriginSources = {
    appBaseUrl: getAppBaseUrl(),
    nodeEnv: process.env.NODE_ENV,
    oauthAllowedOrigins: process.env.OAUTH_ALLOWED_ORIGINS,
    vercelBranchUrl: process.env.VERCEL_BRANCH_URL,
    vercelUrl: process.env.VERCEL_URL,
  },
): Set<string> {
  const origins = new Set<string>(PORTAL_ORIGINS);
  const candidates = [sources.appBaseUrl ?? ""];

  addConfiguredLoopbackAliases(
    origins,
    sources.appBaseUrl,
    sources.nodeEnv ?? process.env.NODE_ENV,
  );

  for (const vercelHostname of [sources.vercelUrl, sources.vercelBranchUrl]) {
    if (!vercelHostname) continue;
    const origin = parseVercelSystemHostname(vercelHostname);
    if (origin) origins.add(origin);
  }
  if (sources.oauthAllowedOrigins) {
    candidates.push(...sources.oauthAllowedOrigins.split(","));
  }

  for (const candidate of candidates) {
    const origin = parseConfiguredOrigin(candidate);
    if (origin) origins.add(origin);
  }
  return origins;
}

export function isPortalMutationMethod(method: string): boolean {
  return MUTATION_METHODS.has(method.toUpperCase());
}

export function isExternalMachineEndpoint(pathname: string): boolean {
  return EXTERNAL_MACHINE_ENDPOINTS.has(pathname);
}

export function isTrustedPortalOriginHeader(
  originHeader: string,
  trustedOrigins: ReadonlySet<string>,
): boolean {
  const origin = parseOriginHeader(originHeader);
  return origin !== null && trustedOrigins.has(origin);
}

/**
 * Decide whether an unsafe request has browser CSRF provenance we trust.
 *
 * Modern browser mutations carry Origin. For an older or stripped request,
 * an exact first-party Referer or browser-owned `Sec-Fetch-Site: same-origin`
 * is sufficient. A cookie without any provenance is rejected; a request with
 * neither cookies nor browser metadata remains available to CLI/API clients.
 */
export function evaluateMutationOrigin(
  headers: Pick<Headers, "get">,
  trustedOrigins: ReadonlySet<string>,
): MutationOriginDecision {
  const originHeader = headers.get("origin");
  if (originHeader !== null) {
    const origin = parseOriginHeader(originHeader);
    if (!origin) return { allowed: false, reason: "origin_malformed" };
    return trustedOrigins.has(origin)
      ? { allowed: true, source: "origin" }
      : { allowed: false, reason: "origin_not_allowed" };
  }

  const referer = headers.get("referer");
  if (referer !== null) {
    const origin = refererOrigin(referer);
    if (!origin) return { allowed: false, reason: "referer_malformed" };
    return trustedOrigins.has(origin)
      ? { allowed: true, source: "referer" }
      : { allowed: false, reason: "referer_not_allowed" };
  }

  const fetchSite = headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "same-origin") {
    return { allowed: true, source: "same-origin-fetch" };
  }
  if (fetchSite || headers.get("cookie") !== null) {
    return { allowed: false, reason: "browser_origin_missing" };
  }

  return { allowed: true, source: "machine" };
}
