import { createHmac, timingSafeEqual } from "crypto";

export const HANDOFF_ISSUER = "jakobscrape-dash";
export const HANDOFF_AUDIENCE = "sajtmaskin-admin";
export const DEFAULT_HANDOFF_NEXT = "/admin/kostnadsfri";

const JTI_PATTERN = /^[0-9a-f]{32}$/;
const JTI_TTL_MS = 2 * 60 * 1000;

const usedJti = new Map<string, number>();

export type HandoffPayload = {
  iss: typeof HANDOFF_ISSUER;
  aud: typeof HANDOFF_AUDIENCE;
  iat: number;
  exp: number;
  jti: string;
  next: string;
};

export function adminHandoffSecret(): string | null {
  const secret = process.env.ADMIN_HANDOFF_SECRET;
  if (!secret || !secret.trim()) return null;
  return secret;
}

/** Keep the browser on this origin. Anything else falls back to the admin stats page. */
export function safeAdminPath(value: string | null | undefined): string {
  const next = String(value ?? "").trim();
  if (next === "/admin" || /^\/admin\/[A-Za-z0-9/_-]*$/.test(next)) return next;
  return DEFAULT_HANDOFF_NEXT;
}

export function verifyAdminHandoff(
  token: string,
  secret: string,
  now = Date.now(),
): HandoffPayload | null {
  if (!secret.trim()) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const expected = createHmac("sha256", secret).update(body, "utf8").digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (record.iss !== HANDOFF_ISSUER || record.aud !== HANDOFF_AUDIENCE) return null;
  const { iat, exp } = record;
  if (typeof iat !== "number" || typeof exp !== "number") return null;
  if (!Number.isInteger(iat) || !Number.isInteger(exp)) return null;
  const seconds = Math.floor(now / 1000);
  if (exp < seconds) return null;
  if (iat > seconds + 30) return null;
  if (typeof record.jti !== "string" || !JTI_PATTERN.test(record.jti)) return null;

  return {
    iss: HANDOFF_ISSUER,
    aud: HANDOFF_AUDIENCE,
    iat,
    exp,
    jti: record.jti,
    next: typeof record.next === "string" ? record.next : "",
  };
}

/** Returns false when this jti was already accepted inside the retention window. */
export function consumeHandoffJti(jti: string, now = Date.now()): boolean {
  for (const [key, until] of usedJti) {
    if (until < now) usedJti.delete(key);
  }
  if (usedJti.has(jti)) return false;
  usedJti.set(jti, now + JTI_TTL_MS);
  return true;
}

export function resetHandoffJtiStore(): void {
  usedJti.clear();
}
