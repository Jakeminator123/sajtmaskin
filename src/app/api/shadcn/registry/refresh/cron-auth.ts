import { timingSafeEqual } from "node:crypto";

function secretsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

export function isCronRefreshAuthorized(
  req: Request,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    // Local/dev may omit the secret. Hosted runtimes must not fail open.
    return !env.VERCEL_ENV;
  }
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const headerSecret = req.headers.get("x-cron-secret") || "";
  return secretsEqual(bearer, secret) || secretsEqual(headerSecret, secret);
}
