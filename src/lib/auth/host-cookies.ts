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
 *
 * A `Cookie` header carries no origin, so a lone unprefixed value is not proof
 * that the portal wrote it — format plus "no duplicate" does not establish
 * origin. On HTTPS the unprefixed name is therefore never an identity. Plain
 * HTTP (`npm run dev` on localhost) keeps reading it because browsers reject
 * `__Host-` without `Secure`.
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

/**
 * Read and write must agree on this flag. A reader that refuses the unprefixed
 * name while the writer still writes it would lock everyone out.
 */
export interface CookiePolicy {
  /** The request runs the HTTPS/`__Host-` policy. */
  secure: boolean;
}

const GUEST_SESSION_ID_RE =
  /^sess_(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/;

/**
 * Registrable portal domains. A parent-domain expire must never target a
 * public suffix (`.se`) or a shared provider apex (`.vercel.app`), and there is
 * no PSL lookup here, so the parent is matched against the domains we own
 * instead of guessed from label counts.
 */
const PORTAL_APEX_DOMAINS = ["sajtmaskin.se", "sajtmaskin.com"] as const;

export function authCookieWriteName(secure: boolean): string {
  return secure ? AUTH_COOKIE_HOST_NAME : AUTH_COOKIE_LEGACY_NAME;
}

export function sessionCookieWriteName(secure: boolean): string {
  return secure ? SESSION_COOKIE_HOST_NAME : SESSION_COOKIE_LEGACY_NAME;
}

/**
 * Single source for "this request runs the HTTPS cookie policy", used by both
 * the readers and the writers so the two can never disagree.
 */
export function requestUsesSecureCookies(request: Request): boolean {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

/**
 * The registrable portal domain a leftover cookie could have been planted on,
 * or null for localhost and any host whose apex we do not own.
 */
export function portalCookieApex(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  if (!hostname) return null;
  return (
    PORTAL_APEX_DOMAINS.find(
      (apex) => hostname === apex || hostname.endsWith(`.${apex}`),
    ) ?? null
  );
}

/**
 * `Domain` for the expiring `Set-Cookie` that removes the unprefixed name, or
 * null when the host has no portal apex we own (localhost, `*.vercel.app`).
 *
 * RFC 6265 §5.2.3 drops a leading dot, so `Domain=.sajtmaskin.se` and
 * `Domain=sajtmaskin.se` address the same cookie — one clear covers both
 * spellings.
 */
export function leftoverCookieDomain(
  host: string | null | undefined,
): string | null {
  const apex = portalCookieApex(host);
  return apex ? `.${apex}` : null;
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
 *
 * On the HTTPS policy the unprefixed name is not an identity at all, not even
 * when it is lone and well formed: nothing in the request says whether the
 * portal or the parent domain wrote it.
 */
export function pickHostOrLegacyCookie(
  cookies: Map<string, string[]>,
  hostName: string,
  legacyName: string,
  policy: CookiePolicy,
): PickedCookie | null {
  const hostValues = cookies.get(hostName);
  if (hostValues && hostValues.length > 0) {
    const host = unambiguousCookieValue(hostValues);
    return host ? { value: host, source: "host" } : null;
  }

  if (policy.secure) return null;

  const legacy = unambiguousCookieValue(cookies.get(legacyName));
  return legacy ? { value: legacy, source: "legacy" } : null;
}

export function pickHostOrLegacyCookieFromHeader(
  cookieHeader: string | null | undefined,
  hostName: string,
  legacyName: string,
  policy: CookiePolicy,
): PickedCookie | null {
  return pickHostOrLegacyCookie(
    parseCookieHeader(cookieHeader),
    hostName,
    legacyName,
    policy,
  );
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
      { secure: requestUsesSecureCookies(request) },
    )?.value ?? null
  );
}

export function isGuestSessionId(value: string): boolean {
  return GUEST_SESSION_ID_RE.test(value);
}

/**
 * `x-forwarded-proto` reports HTTPS. Used only to tighten a read policy that
 * already defaults to the deployment's own protocol, so a spoofed value can
 * never loosen it.
 */
export function forwardedProtoIsHttps(
  value: string | null | undefined,
): boolean {
  return value?.split(",")[0]?.trim().toLowerCase() === "https";
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

export function expireCookieSetOptions(
  secure: boolean,
  domain?: string,
): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: 0;
  expires: Date;
  domain?: string;
} {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    ...(domain ? { domain } : {}),
  };
}

/**
 * The one clear that removes the unprefixed name on the HTTPS policy.
 *
 * Next serializes at most one `Set-Cookie` per cookie name — `ResponseCookies`
 * is a name-keyed map and every `set()` rewrites the header list from it — so a
 * host-only clear and a `Domain=` clear cannot both ship for the same name.
 * Target the parent `Domain`, because that is the spelling a host-only clear can
 * never reach and the one a subdomain can plant. The host-only leftover is our
 * own pre-migration cookie, is no longer read on HTTPS, and ages out with its
 * original `Max-Age`.
 */
export function expireLeftoverCookieOptions(
  host: string | null | undefined,
): ReturnType<typeof expireCookieSetOptions> {
  return expireCookieSetOptions(true, leftoverCookieDomain(host) ?? undefined);
}

export function formatSetCookie(
  name: string,
  value: string,
  options: {
    secure: boolean;
    maxAge: number;
    expires?: Date;
    domain?: string;
  },
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${options.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/**
 * `Set-Cookie` string that expires the unprefixed name. On the HTTPS policy it
 * targets the parent `Domain` for the reason given on
 * {@link expireLeftoverCookieOptions}.
 */
export function expireLeftoverCookieHeader(
  name: string,
  args: { secure: boolean; host?: string | null },
): string {
  return formatSetCookie(name, "", {
    secure: args.secure,
    maxAge: 0,
    expires: new Date(0),
    ...(args.secure
      ? { domain: leftoverCookieDomain(args.host) ?? undefined }
      : {}),
  });
}
