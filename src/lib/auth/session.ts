/**
 * Session Management
 *
 * Provides anonymous session IDs for rate limiting, project ownership,
 * and guest tracking. Auth identity is handled separately by auth.ts
 * via JWT tokens in the sajtmaskin_auth cookie.
 */

import { randomBytes, randomUUID } from "crypto";

const SESSION_COOKIE_NAME = "sajtmaskin_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

function generateSessionId(): string {
  try {
    return `sess_${randomUUID()}`;
  } catch {
    return `sess_${randomBytes(16).toString("hex")}`;
  }
}

/**
 * Get session ID from request headers (for API routes)
 */
export function getSessionIdFromRequest(request: Request): string | null {
  const headers = new Headers(request.headers);

  const cookieHeader = headers.get("cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      const equalIndex = cookie.indexOf("=");
      if (equalIndex === -1) continue;
      const name = cookie.substring(0, equalIndex);
      const value = cookie.substring(equalIndex + 1);
      if (name === SESSION_COOKIE_NAME) {
        return value;
      }
    }
  }

  const sessionHeader = headers.get("x-session-id");
  if (sessionHeader) {
    return sessionHeader;
  }

  return null;
}

export function ensureSessionIdFromRequest(request: Request): {
  sessionId: string;
  setCookie: string | null;
} {
  const existing = getSessionIdFromRequest(request);
  if (existing) {
    return { sessionId: existing, setCookie: null };
  }
  const sessionId = generateSessionId();
  let secure = process.env.NODE_ENV === "production";
  try {
    secure = new URL(request.url).protocol === "https:";
  } catch {
    // fallback to NODE_ENV
  }
  return { sessionId, setCookie: createSessionCookie(sessionId, { secure }) };
}

/**
 * Create session cookie value for Set-Cookie header
 */
export function createSessionCookie(sessionId: string, options?: { secure?: boolean }): string {
  const secureFlag =
    typeof options?.secure === "boolean" ? options.secure : process.env.NODE_ENV === "production";
  const secure = secureFlag ? "; Secure" : "";
  const sameSite = "; SameSite=Lax";
  const httpOnly = "; HttpOnly";
  const path = "; Path=/";
  const maxAge = `; Max-Age=${SESSION_MAX_AGE}`;

  return `${SESSION_COOKIE_NAME}=${sessionId}${path}${maxAge}${httpOnly}${sameSite}${secure}`;
}
