/**
 * Platform session-cookie names and Cookie-header picking.
 *
 * `.se` is a public suffix; `sajtmaskin.se` is not. A customer site under
 * `*.sites.sajtmaskin.se` can set `Domain=.sajtmaskin.se` and shadow a
 * host-only cookie that shares the same name. `__Host-` cannot carry a
 * Domain attribute, so a subdomain cannot mint that name for the portal host.
 *
 * `cookies().get()` / first-wins header scans are not safe when two cookies
 * share a name (host-only vs parent-domain). Callers must parse every pair
 * and refuse a name that has conflicting values.
 */

export const AUTH_COOKIE_LEGACY_NAME = "sajtmaskin_auth";
export const AUTH_COOKIE_HOST_NAME = "__Host-sajtmaskin_auth";

export const SESSION_COOKIE_LEGACY_NAME = "sajtmaskin_session";
export const SESSION_COOKIE_HOST_NAME = "__Host-sajtmaskin_session";

export const OAUTH_COOKIE_LEGACY_NAMES = {
  google: "sajtmaskin_oauth_google",
  github: "sajtmaskin_oauth_github",
} as const;

export const OAUTH_COOKIE_HOST_NAMES = {
  google: "__Host-sajtmaskin_oauth_google",
  github: "__Host-sajtmaskin_oauth_github",
} as const;

export type HostCookieSource = "host" | "legacy";

export interface PickedCookie {
  value: string;
  source: HostCookieSource;
}

const GUEST_SESSION_ID_RE =
  /^sess_(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/;

export function authCookieWriteName(secure: boolean): string {
  return secure ? AUTH_COOKIE_HOST_NAME : AUTH_COOKIE_LEGACY_NAME;
}

export function sessionCookieWriteName(secure: boolean): string {
  return secure ? SESSION_COOKIE_HOST_NAME : SESSION_COOKIE_LEGACY_NAME;
}

export function parseCookieHeader(
  cookieHeader: string | null | undefined,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!cookieHeader) return map;

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    const existing = map.get(name);
    if (existing) existing.push(value);
    else map.set(name, [value]);
  }

  return map;
}

export function cookieMapFromList(
  cookies: Iterable<{ name: string; value: string }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const cookie of cookies) {
    const existing = map.get(cookie.name);
    if (existing) existing.push(cookie.value);
    else map.set(cookie.name, [cookie.value]);
  }
  return map;
}

/**
 * A name is usable only when every occurrence has the same non-empty value.
 * Two values for the same name is the host-only vs parent-domain case.
 */
export function unambiguousCookieValue(
  values: string[] | undefined,
): string | null {
  if (!values || values.length === 0) return null;
  const unique = [...new Set(values)];
  if (unique.length !== 1) return null;
  return unique[0] === "" ? null : unique[0];
}

/**
 * Prefer `__Host-` when that name is present. Do not fall back to the
 * unprefixed name while the host name is on the request — that leftover
 * can be a parent-domain shadow.
 */
export function pickHostOrLegacyCookie(
  cookies: Map<string, string[]>,
  hostName: string,
  legacyName: string,
): PickedCookie | null {
  const hostValues = cookies.get(hostName);
  if (hostValues && hostValues.length > 0) {
    const host = unambiguousCookieValue(hostValues);
    return host ? { value: host, source: "host" } : null;
  }

  const legacy = unambiguousCookieValue(cookies.get(legacyName));
  return legacy ? { value: legacy, source: "legacy" } : null;
}

export function pickHostOrLegacyCookieFromHeader(
  cookieHeader: string | null | undefined,
  hostName: string,
  legacyName: string,
): PickedCookie | null {
  return pickHostOrLegacyCookie(parseCookieHeader(cookieHeader), hostName, legacyName);
}

export function getAuthTokenFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }
  return (
    pickHostOrLegacyCookieFromHeader(
      request.headers.get("cookie"),
      AUTH_COOKIE_HOST_NAME,
      AUTH_COOKIE_LEGACY_NAME,
    )?.value ?? null
  );
}

export function isGuestSessionId(value: string): boolean {
  return GUEST_SESSION_ID_RE.test(value);
}

export function hostCookieSetOptions(args: {
  secure: boolean;
  maxAge: number;
}): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: args.secure,
    sameSite: "lax",
    path: "/",
    maxAge: args.maxAge,
  };
}

export function expireCookieSetOptions(secure: boolean): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: 0;
  expires: Date;
} {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
}

export function formatSetCookie(
  name: string,
  value: string,
  options: {
    secure: boolean;
    maxAge: number;
    expires?: Date;
  },
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${options.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}
