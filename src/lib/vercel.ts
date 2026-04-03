/**
 * Vercel token helpers for REST API calls and Vercel-authenticated preview flows.
 */

const OIDC_MIN_REMAINING_SEC = 60;

function decodeJwtExpSeconds(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
      exp?: number;
    };
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

function vercelOidcTokenLooksUsable(raw: string): boolean {
  const exp = decodeJwtExpSeconds(raw);
  if (exp === null) return false;
  const now = Math.floor(Date.now() / 1000);
  return exp > now + OIDC_MIN_REMAINING_SEC;
}

/**
 * `VERCEL_OIDC_TOKEN` is only treated as present for auth checks when the JWT is
 * non-expired. Stale values in `.env.local` must not satisfy "configured" gates.
 */
export function isUsableVercelOidcToken(): boolean {
  const raw = process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!raw) return false;
  return vercelOidcTokenLooksUsable(raw);
}

function normalizeVercelToken(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("vercel_token=") ? trimmed.slice("vercel_token=".length) : trimmed;
}

/**
 * Pick REST / Sandbox access token when both `VERCEL_TOKEN` and `VERCEL_TOKEN_FULL`
 * are set. Prefer a value that looks like a current access token (e.g. `vcp_…`).
 */
export function pickVercelAccessTokenFromEnv(): string {
  const primary = normalizeVercelToken(process.env.VERCEL_TOKEN);
  const secondary = normalizeVercelToken(process.env.VERCEL_TOKEN_FULL);
  const looksLikeModernAccess = (t: string) =>
    t.startsWith("vcp_") || t.startsWith("vercel_");
  if (secondary && looksLikeModernAccess(secondary) && !looksLikeModernAccess(primary)) {
    return secondary;
  }
  return primary || secondary;
}

export function hasVercelRestToken(): boolean {
  return Boolean(pickVercelAccessTokenFromEnv());
}

export function getVercelToken(): string {
  const token = pickVercelAccessTokenFromEnv();
  if (!token) {
    throw new Error(
      "Missing VERCEL_TOKEN (or VERCEL_TOKEN_FULL). Set it in your environment variables.",
    );
  }
  return token;
}
