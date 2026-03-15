import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { REDIS_KEY_PREFIX } from "./config";

const _resolvedRestUrl =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const _resolvedRestToken =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const _redisNamespace = REDIS_KEY_PREFIX.replace(/:$/, "");

if (process.env.NODE_ENV === "production" && !_resolvedRestUrl) {
  console.warn(
    "[RateLimit] WARNING: Using in-memory rate limiting in production. This is unreliable in serverless. Set UPSTASH_REDIS_REST_URL (or KV_REST_API_URL via Vercel integration).",
  );
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  "auth:register": { maxRequests: 5, windowMs: 15 * 60 * 1000 },
  "auth:login": { maxRequests: 20, windowMs: 15 * 60 * 1000 },
  "auth:resend-verification": { maxRequests: 6, windowMs: 60 * 60 * 1000 },
  "contact:submit": { maxRequests: 10, windowMs: 10 * 60 * 1000 },
  "audit:create": { maxRequests: 4, windowMs: 10 * 60 * 1000 },
  "analyze:website": { maxRequests: 10, windowMs: 60 * 1000 },
  "media:upload": { maxRequests: 20, windowMs: 60 * 1000 },
  "media:upload-url": { maxRequests: 12, windowMs: 60 * 1000 },
  "audio:transcribe": { maxRequests: 10, windowMs: 60 * 1000 },
  "text:extract": { maxRequests: 20, windowMs: 60 * 1000 },
  "text:analyze": { maxRequests: 20, windowMs: 60 * 1000 },
  "openclaw:chat": { maxRequests: 20, windowMs: 60 * 1000 },
  "openclaw:tips": { maxRequests: 20, windowMs: 60 * 1000 },
  "did:chat": { maxRequests: 20, windowMs: 60 * 1000 },
  "template:init": { maxRequests: 10, windowMs: 60 * 1000 },
  "domains:suggest": { maxRequests: 15, windowMs: 60 * 1000 },
  "domains:save": { maxRequests: 15, windowMs: 60 * 1000 },
  "domains:link": { maxRequests: 10, windowMs: 60 * 1000 },
  "domains:verify": { maxRequests: 15, windowMs: 60 * 1000 },
  "domains:check": { maxRequests: 20, windowMs: 60 * 1000 },
  "download:create": { maxRequests: 10, windowMs: 60 * 1000 },
  "chat:create": { maxRequests: 15, windowMs: 60 * 1000 },
  "message:send": { maxRequests: 30, windowMs: 60 * 1000 },
  "deployment:create": { maxRequests: 8, windowMs: 60 * 1000 },
  "blob:export": { maxRequests: 8, windowMs: 60 * 1000 },
  "ai:chat": { maxRequests: 30, windowMs: 60 * 1000 },
  "ai:brief": { maxRequests: 30, windowMs: 60 * 1000 },
  "figma:preview": { maxRequests: 20, windowMs: 60 * 1000 },
  "github:export": { maxRequests: 8, windowMs: 60 * 1000 },
  "fetch:html": { maxRequests: 12, windowMs: 60 * 1000 },
  read: { maxRequests: 150, windowMs: 60 * 1000 },
  default: { maxRequests: 90, windowMs: 60 * 1000 },
  "webhook:v0": { maxRequests: 180, windowMs: 60 * 1000 },
  "sandbox:create": { maxRequests: 15, windowMs: 60 * 1000 },
  "csp:report": { maxRequests: 100, windowMs: 60 * 1000 },
  // v0 Platform API - separate limit to track v0 usage specifically
  "v0:generate": { maxRequests: 20, windowMs: 60 * 1000 },
  "v0:stream": { maxRequests: 30, windowMs: 60 * 1000 },
};

let _cachedRedis: Redis | null = null;
const _cachedLimiters = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  if (_cachedRedis) return _cachedRedis;
  if (!_resolvedRestUrl || !_resolvedRestToken) return null;
  _cachedRedis = new Redis({ url: _resolvedRestUrl, token: _resolvedRestToken });
  return _cachedRedis;
}

function getLimiter(
  endpoint: string,
  limits: RateLimitConfig,
): { mode: "upstash"; limiter: Ratelimit } | { mode: "memory" } {
  const redis = getRedis();
  if (!redis) return { mode: "memory" };

  const key = `${endpoint}:${limits.maxRequests}:${limits.windowMs}`;
  const cached = _cachedLimiters.get(key);
  if (cached) return { mode: "upstash", limiter: cached };

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(
      limits.maxRequests,
      `${Math.max(1, Math.floor(limits.windowMs / 1000))} s`,
    ),
    prefix: `sajtmaskin:${_redisNamespace}:ratelimit:${endpoint}`,
  });
  _cachedLimiters.set(key, limiter);
  return { mode: "upstash", limiter };
}

export function getClientId(request: Request, userId?: string): string {
  if (userId) return `user:${userId}`;

  const ip =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  return `ip:${ip}`;
}

export function checkRateLimit(
  clientId: string,
  endpoint: string,
  config?: RateLimitConfig,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = `${clientId}:${endpoint}`;
  const limits = config || RATE_LIMITS[endpoint] || RATE_LIMITS["default"];

  if (Math.random() < 0.01) {
    cleanupExpiredEntries();
  }

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + limits.windowMs,
    };
    rateLimitStore.set(key, newEntry);

    return {
      allowed: true,
      remaining: limits.maxRequests - 1,
      resetAt: newEntry.resetAt,
    };
  }

  if (entry.count >= limits.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: limits.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

export function createRateLimitHeaders(result: {
  remaining: number;
  resetAt: number;
}): Record<string, string> {
  return {
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(result.resetAt / 1000).toString(),
  };
}

export async function withRateLimit(
  request: Request,
  endpoint: string,
  handler: () => Promise<Response>,
  options?: { userId?: string },
): Promise<Response> {
  const clientId = getClientId(request, options?.userId);
  const limits = RATE_LIMITS[endpoint] || RATE_LIMITS["default"];
  const limiter = getLimiter(endpoint, limits);
  const rateLimitMode = limiter.mode;

  let result: { allowed: boolean; remaining: number; resetAt: number };

  if (limiter.mode === "upstash") {
    const { success, remaining, reset } = await limiter.limiter.limit(clientId);
    result = {
      allowed: success,
      remaining: Math.max(0, Number(remaining ?? 0)),
      resetAt: typeof reset === "number" ? reset : Date.now() + limits.windowMs,
    };
  } else {
    result = checkRateLimit(clientId, endpoint, limits);
  }

  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: "Too many requests",
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...createRateLimitHeaders(result),
          "Retry-After": Math.ceil((result.resetAt - Date.now()) / 1000).toString(),
          "X-RateLimit-Mode": rateLimitMode,
        },
      },
    );
  }

  const response = await handler();
  const clonedResponse = response.clone();

  const headers = new Headers(clonedResponse.headers);
  Object.entries(createRateLimitHeaders(result)).forEach(([key, value]) => {
    headers.set(key, value);
  });
  headers.set("X-RateLimit-Mode", rateLimitMode);

  return new Response(clonedResponse.body, {
    status: clonedResponse.status,
    statusText: clonedResponse.statusText,
    headers,
  });
}
