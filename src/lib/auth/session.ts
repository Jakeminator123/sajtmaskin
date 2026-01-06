/**
 * Session Management
 *
 * Prepares for future Google OAuth integration.
 * Currently uses simple session ID for rate limiting and project ownership.
 *
 * Future implementation will include:
 * - Google OAuth login
 * - JWT tokens
 * - Secure HTTP-only cookies
 */

import { cookies } from "next/headers";
import { randomBytes, randomUUID } from "crypto";

// Session configuration
const SESSION_COOKIE_NAME = "sajtmaskin_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export interface SessionUser {
  id: string;
  email?: string;
  name?: string;
  image?: string;
  provider?: "google" | "anonymous";
}

export interface Session {
  id: string;
  user: SessionUser | null;
  createdAt: number;
  expiresAt: number;
}

/**
 * Generate a secure session ID
 */
function generateSessionId(): string {
  // Prefer cryptographically strong IDs; fall back to randomBytes if UUID unavailable
  try {
    return `sess_${randomUUID()}`;
  } catch {
    return `sess_${randomBytes(16).toString("hex")}`;
  }
}

/**
 * Get or create a session for the current request
 * Creates an anonymous session if none exists
 */
export async function getSession(): Promise<Session> {
  const cookieStore = await cookies();
  const existingSessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (existingSessionId) {
    // Validate session format
    if (existingSessionId.startsWith("sess_")) {
      // TODO: In production, validate against session store (Redis/DB)
      // Refresh cookie to extend expiry
      cookieStore.set({
        name: SESSION_COOKIE_NAME,
        value: existingSessionId,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE,
        secure: process.env.NODE_ENV === "production",
      });
      return {
        id: existingSessionId,
        user: null, // Will be populated when auth is implemented
        createdAt: Date.now(), // Would come from session store
        expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
      };
    }
  }

  // Create new anonymous session
  const newSessionId = generateSessionId();
  const session: Session = {
    id: newSessionId,
    user: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
  };

  // Set cookie immediately so subsequent requests reuse the same session
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: newSessionId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  return session;
}

/**
 * Get session ID from request headers (for API routes)
 */
export function getSessionIdFromRequest(request: Request): string | null {
  const headers = new Headers(request.headers);

  // Check cookie header
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

  // Check custom header (for API clients)
  const sessionHeader = headers.get("x-session-id");
  if (sessionHeader) {
    return sessionHeader;
  }

  return null;
}

/**
 * Create session cookie value for Set-Cookie header
 */
export function createSessionCookie(sessionId: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const sameSite = "; SameSite=Lax";
  const httpOnly = "; HttpOnly";
  const path = "; Path=/";
  const maxAge = `; Max-Age=${SESSION_MAX_AGE}`;

  return `${SESSION_COOKIE_NAME}=${sessionId}${path}${maxAge}${httpOnly}${sameSite}${secure}`;
}

/**
 * Clear session cookie (for logout)
 */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}
