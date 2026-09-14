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
  formatSetCookie,
  isGuestSessionId,
  parseCookieHeader,
  pickHostOrLegacyCookie,
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
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

/**
 * Read the guest session from the Cookie header.
 *
 * Host-prefixed cookie wins. A lone well-formed legacy cookie is accepted
 * only when the `__Host-` name is absent and that name is not duplicated
 * with conflicting values. That is the verified transition: format + no
 * shadow. A shadowed/ambiguous leftover is not used to move ownership.
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

export function ensureSessionIdFromRequest(request: Request): {
  sessionId: string;
  setCookie: string | null;
} {
  const existing = resolveGuestSessionFromRequest(request);
  const secure = requestWantsSecureCookie(request);

  if (existing?.source === "host") {
    return { sessionId: existing.sessionId, setCookie: null };
  }

  if (existing?.source === "legacy" && isGuestSessionId(existing.sessionId)) {
    // Verified transition: unambiguous, format-valid leftover. Re-issue as
    // `__Host-` with the same id so later requests stop reading the old name.
    return {
      sessionId: existing.sessionId,
      setCookie: createSessionCookie(existing.sessionId, { secure }),
    };
  }

  if (existing?.source === "header") {
    return {
      sessionId: existing.sessionId,
      setCookie: createSessionCookie(existing.sessionId, { secure }),
    };
  }

  const sessionId = generateSessionId();
  return { sessionId, setCookie: createSessionCookie(sessionId, { secure }) };
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
