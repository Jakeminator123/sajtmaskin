/**
 * Session Management
 *
 * Provides anonymous session IDs for rate limiting, project ownership,
 * and guest tracking. Auth identity is handled separately by auth.ts
 * via JWT tokens in the sajtmaskin_auth / `__Host-sajtmaskin_auth` cookie.
 */

import { randomBytes, randomUUID } from "crypto";
import {
  SESSION_COOKIE_HOST_NAME,
  SESSION_COOKIE_LEGACY_NAME,
  expireLeftoverCookieHeader,
  formatSetCookie,
  isGuestSessionId,
  parseCookieHeader,
  pickHostOrLegacyCookie,
  requestUsesSecureCookies,
  sessionCookieWriteName,
  type HostCookieSource,
} from "@/lib/auth/host-cookies";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export interface ResolvedGuestSession {
  sessionId: string;
  source: HostCookieSource | "header";
}

function generateSessionId(): string {
  try {
    return `sess_${randomUUID()}`;
  } catch {
    return `sess_${randomBytes(16).toString("hex")}`;
  }
}

function requestWantsSecureCookie(request: Request, override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  return requestUsesSecureCookies(request);
}

/**
 * Read the guest session from the Cookie header.
 *
 * Host-prefixed cookie wins. On HTTPS the unprefixed name is not a guest
 * identity: the header does not say whether the portal or a subdomain on
 * `Domain=.sajtmaskin.se` wrote it, so format plus "no duplicate" is not proof
 * of origin. Plain HTTP still reads it so local dev keeps its session.
 */
export function resolveGuestSessionFromRequest(
  request: Request,
): ResolvedGuestSession | null {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const hostPresent = (cookies.get(SESSION_COOKIE_HOST_NAME)?.length ?? 0) > 0;
  const legacyPresent = (cookies.get(SESSION_COOKIE_LEGACY_NAME)?.length ?? 0) > 0;
  const picked = pickHostOrLegacyCookie(
    cookies,
    SESSION_COOKIE_HOST_NAME,
    SESSION_COOKIE_LEGACY_NAME,
    { secure: requestWantsSecureCookie(request) },
  );

  if (picked && isGuestSessionId(picked.value)) {
    return { sessionId: picked.value, source: picked.source };
  }

  if (hostPresent || legacyPresent) {
    // Cookie names were present but unusable (conflict or bad format).
    // Do not fall through to the client-controlled x-session-id header.
    return null;
  }

  const sessionHeader = request.headers.get("x-session-id");
  if (sessionHeader && isGuestSessionId(sessionHeader)) {
    return { sessionId: sessionHeader, source: "header" };
  }

  return null;
}

/**
 * Get session ID from request headers (for API routes)
 */
export function getSessionIdFromRequest(request: Request): string | null {
  return resolveGuestSessionFromRequest(request)?.sessionId ?? null;
}

export interface EnsuredGuestSession {
  sessionId: string;
  /** The guest session cookie to write, or null when `__Host-` already holds it. */
  setCookie: string | null;
  /**
   * `setCookie` plus the `Set-Cookie` that expires the unprefixed leftover on
   * HTTPS. A caller that emits only `setCookie` leaves the leftover in place —
   * inert, because the HTTPS reader no longer accepts that name.
   */
  setCookies: string[];
}

/**
 * On HTTPS a leftover guest id is never re-issued as `__Host-`: an unverified
 * id must not become the portal's identity, so a new id is minted here. The
 * leftover's own projects are reconnected on the login path instead, see
 * `guest-claim.ts`. Local HTTP keeps the leftover→same-id upgrade.
 */
export function ensureSessionIdFromRequest(request: Request): EnsuredGuestSession {
  const existing = resolveGuestSessionFromRequest(request);
  const secure = requestWantsSecureCookie(request);
  const leftoverPresent = parseCookieHeader(
    request.headers.get("cookie"),
  ).has(SESSION_COOKIE_LEGACY_NAME);
  const expireLeftover =
    secure && leftoverPresent
      ? [
          expireLeftoverCookieHeader(SESSION_COOKIE_LEGACY_NAME, {
            secure: true,
            host: request.headers.get("host"),
          }),
        ]
      : [];

  const resolved = (sessionId: string, setCookie: string | null) => ({
    sessionId,
    setCookie,
    setCookies: [...(setCookie ? [setCookie] : []), ...expireLeftover],
  });

  if (existing?.source === "host") {
    return resolved(existing.sessionId, null);
  }

  // `legacy` is only reachable on plain HTTP — the HTTPS picker refuses the
  // unprefixed name outright. Re-check here so the write site states the same
  // invariant as the reader: no leftover id is ever promoted to `__Host-`.
  if (existing && !(secure && existing.source === "legacy")) {
    return resolved(
      existing.sessionId,
      createSessionCookie(existing.sessionId, { secure }),
    );
  }

  const sessionId = generateSessionId();
  return resolved(sessionId, createSessionCookie(sessionId, { secure }));
}

/**
 * Create session cookie value for Set-Cookie header.
 * `__Host-` only when Secure is on (browsers reject the prefix otherwise).
 */
export function createSessionCookie(sessionId: string, options?: { secure?: boolean }): string {
  const secure =
    typeof options?.secure === "boolean"
      ? options.secure
      : process.env.NODE_ENV === "production";
  return formatSetCookie(sessionCookieWriteName(secure), sessionId, {
    secure,
    maxAge: SESSION_MAX_AGE,
  });
}

export { isGuestSessionId };
