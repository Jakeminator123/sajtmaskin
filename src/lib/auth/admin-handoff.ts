import { createHmac, timingSafeEqual } from "crypto";
import { Redis } from "@upstash/redis";
import { getServerEnv } from "@/lib/env";

export const HANDOFF_ISSUER = "jakobscrape-dash";
export const HANDOFF_AUDIENCE = "sajtmaskin-admin";
export const HANDOFF_TTL_SECONDS = 60;
export const DEFAULT_HANDOFF_NEXT = "/admin/kostnadsfri";
export const MIN_HANDOFF_SECRET_LENGTH = 32;

const JTI_PATTERN = /^[0-9a-f]{32}$/;
const JTI_TTL_MS = 2 * 60 * 1000;
const JTI_TTL_SECONDS = JTI_TTL_MS / 1000;

const usedJti = new Map<string, number>();
let redisClient: Redis | null = null;
let redisCacheKey = "";

export type HandoffJtiStatus = "fresh" | "replay" | "unavailable";

export type HandoffPayload = {
  iss: typeof HANDOFF_ISSUER;
  aud: typeof HANDOFF_AUDIENCE;
  iat: number;
  exp: number;
  jti: string;
  next: string;
};

/** A short or placeholder secret would let anyone sign a ticket, so it counts as missing. */
export function adminHandoffSecret(): string | null {
  const secret = getServerEnv().ADMIN_HANDOFF_SECRET;
  if (!secret || secret.length < MIN_HANDOFF_SECRET_LENGTH) return null;
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
  if (exp < iat || exp > iat + HANDOFF_TTL_SECONDS) return null;
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

function replayRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  const cacheKey = `${url}\n${token}`;
  if (redisClient && redisCacheKey === cacheKey) return redisClient;
  redisClient = new Redis({ url, token });
  redisCacheKey = cacheKey;
  return redisClient;
}

function consumeMemoryJti(jti: string, now: number): HandoffJtiStatus {
  for (const [key, until] of usedJti) {
    if (until < now) usedJti.delete(key);
  }
  if (usedJti.has(jti)) return "replay";
  usedJti.set(jti, now + JTI_TTL_MS);
  return "fresh";
}

/** Remembers a jti for at least two minutes. Production without Redis cannot prove that. */
export async function consumeHandoffJti(jti: string, now = Date.now()): Promise<HandoffJtiStatus> {
  const redis = replayRedis();
  if (redis) {
    try {
      // No prod/preview prefix: the same secret is valid in both, so a shared Redis must share this slot.
      const ok = await redis.set(`admin-handoff:jti:${jti}`, "1", {
        ex: JTI_TTL_SECONDS,
        nx: true,
      });
      return ok === "OK" ? "fresh" : "replay";
    } catch {
      return "unavailable";
    }
  }
  if (process.env.NODE_ENV === "production") return "unavailable";
  return consumeMemoryJti(jti, now);
}

export function resetHandoffJtiStore(): void {
  usedJti.clear();
  redisClient = null;
  redisCacheKey = "";
}
