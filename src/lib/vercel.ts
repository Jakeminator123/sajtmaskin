/**
 * Vercel token helpers for REST API calls.
 * Supports VERCEL_TOKEN (preferred) and VERCEL_API_TOKEN (legacy).
 */

export function assertVercelToken(): void {
  if (!process.env.VERCEL_TOKEN && !process.env.VERCEL_API_TOKEN) {
    throw new Error('Missing VERCEL_TOKEN. Set it in your environment variables.');
  }
}

export function getVercelToken(): string {
  const token =
    (process.env.VERCEL_TOKEN && process.env.VERCEL_TOKEN.trim()) ||
    (process.env.VERCEL_API_TOKEN && process.env.VERCEL_API_TOKEN.trim());
  if (!token) {
    throw new Error('Missing VERCEL_TOKEN. Set it in your environment variables.');
  }
  return token;
}
