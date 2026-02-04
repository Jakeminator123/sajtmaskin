/**
 * Vercel token helpers for REST API calls.
 */

function normalizeVercelToken(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("vercel_token=") ? trimmed.slice("vercel_token=".length) : trimmed;
}

export function assertVercelToken(): void {
  if (!normalizeVercelToken(process.env.VERCEL_TOKEN)) {
    throw new Error("Missing VERCEL_TOKEN. Set it in your environment variables.");
  }
}

export function getVercelToken(): string {
  const token = normalizeVercelToken(process.env.VERCEL_TOKEN);
  if (!token) {
    throw new Error("Missing VERCEL_TOKEN. Set it in your environment variables.");
  }
  return token;
}
