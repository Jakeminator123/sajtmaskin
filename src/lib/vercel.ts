/**
 * Vercel token helpers for REST API calls and Vercel-authenticated preview flows.
 */

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
  const looksLikeModernAccess = (t: string) => t.startsWith("vcp_") || t.startsWith("vercel_");
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
