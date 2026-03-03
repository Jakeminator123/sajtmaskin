/**
 * Edge-compatible JWT verification and admin check.
 *
 * Uses Web Crypto API (globalThis.crypto.subtle) — safe for Next.js
 * middleware which runs on Edge Runtime (no Node.js crypto module).
 *
 * Mirrors the HS256 JWT format produced by auth.ts:
 *   header.payload.signature  (base64url-encoded, HMAC-SHA256)
 */

interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

const AUTH_COOKIE_NAME = "sajtmaskin_auth";

function base64UrlDecode(input: string): Uint8Array {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Verify a HS256 JWT using Web Crypto and return the payload, or null on failure.
 */
export async function verifyTokenEdge(
  token: string,
  jwtSecret: string,
): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;

    const key = await importHmacKey(jwtSecret);
    const enc = new TextEncoder();
    const data = enc.encode(`${header}.${body}`);

    const expectedSig = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, data),
    );
    const expectedB64 = base64UrlEncode(expectedSig);

    if (signature !== expectedB64) return null;

    const payloadBytes = base64UrlDecode(body);
    const payloadStr = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadStr) as JWTPayload;

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract the JWT token string from a request's cookies or Authorization header.
 */
export function getTokenFromRequestEdge(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const trimmed = part.trim();
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      if (trimmed.substring(0, eqIdx) === AUTH_COOKIE_NAME) {
        return trimmed.substring(eqIdx + 1);
      }
    }
  }

  return null;
}

/**
 * Check if an email belongs to an admin.
 *
 * Reads ADMIN_EMAILS (comma-separated), SUPERADMIN_EMAIL, and TEST_USER_EMAIL
 * directly from process.env (available in Edge Runtime).
 */
export function isAdminEmailEdge(email: string): boolean {
  const lower = email.toLowerCase();

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.includes(lower)) return true;

  const superadmin = (process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
  if (superadmin && lower === superadmin) return true;

  const testUser = (process.env.TEST_USER_EMAIL || "").trim().toLowerCase();
  if (testUser && lower === testUser) return true;

  return false;
}
