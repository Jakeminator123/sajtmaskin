/**
 * Vercel token helpers for REST API calls.
 */

export function assertVercelToken(): void {
  if (!process.env.VERCEL_TOKEN) {
    throw new Error("Missing VERCEL_TOKEN. Set it in your environment variables.");
  }
}

export function getVercelToken(): string {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    throw new Error("Missing VERCEL_TOKEN. Set it in your environment variables.");
  }
  return token;
}
