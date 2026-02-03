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
import { Redis } from "@upstash/redis";

// Session configuration
const SESSION_COOKIE_NAME = "sajtmaskin_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
const SESSION_STORE_PREFIX = "sajtmaskin:session:";

type StoredSession = {
  createdAt: number;
  expiresAt: number;
};

let _redisClient: Redis | null | undefined;

function getUpstashEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function getRedisClient(): Redis | null {
  if (_redisClient !== undefined) return _redisClient;
  const env = getUpstashEnv();
  _redisClient = env ? new Redis({ url: env.url, token: env.token }) : null;
  return _redisClient;
}

function isSessionStoreEnabled(): boolean {
  return Boolean(getUpstashEnv());
}

function toStoredSession(value: unknown): StoredSession | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return toStoredSession(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const createdAt = typeof obj.createdAt === "number" ? obj.createdAt : Date.now();
  const expiresAt = typeof obj.expiresAt === "number" ? obj.expiresAt : Date.now();
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return null;
  return { createdAt, expiresAt };
}

async function readSessionFromStore(sessionId: string): Promise<StoredSession | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(`${SESSION_STORE_PREFIX}${sessionId}`);
    const parsed = toStoredSession(raw);
    if (!parsed) return null;
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeSessionToStore(sessionId: string, session: StoredSession): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(`${SESSION_STORE_PREFIX}${sessionId}`, JSON.stringify(session), {
      ex: SESSION_MAX_AGE,
    });
  } catch {
    // Best-effort only
  }
}

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
  const storeEnabled = isSessionStoreEnabled();

  if (existingSessionId) {
    // Validate session format
    if (existingSessionId.startsWith("sess_")) {
      if (storeEnabled) {
        const stored = await readSessionFromStore(existingSessionId);
        if (stored) {
          const refreshed: StoredSession = {
            createdAt: stored.createdAt,
            expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
          };
          await writeSessionToStore(existingSessionId, refreshed);
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
            createdAt: stored.createdAt,
            expiresAt: refreshed.expiresAt,
          };
        }
      } else {
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
          createdAt: Date.now(),
          expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
        };
      }
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

  if (storeEnabled) {
    await writeSessionToStore(newSessionId, {
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    });
  }

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

export function ensureSessionIdFromRequest(request: Request): {
  sessionId: string;
  setCookie: string | null;
} {
  const existing = getSessionIdFromRequest(request);
  if (existing) {
    return { sessionId: existing, setCookie: null };
  }
  const sessionId = generateSessionId();
  return { sessionId, setCookie: createSessionCookie(sessionId) };
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
