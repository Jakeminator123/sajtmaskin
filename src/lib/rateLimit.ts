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
  // OC_DEBUG Mode B bug-hunt: each call drives real generation/repair for up to
  // maxDuration, so a tight bucket caps runaway cost/load even if the operator
  // token leaks. Without an explicit entry it would inherit the 90/min default.
  "openclaw:debug-run": { maxRequests: 6, windowMs: 60 * 1000 },
  "did:chat": { maxRequests: 20, windowMs: 60 * 1000 },
  "template:init": { maxRequests: 10, windowMs: 60 * 1000 },
  "domains:suggest": { maxRequests: 15, windowMs: 60 * 1000 },
  "domains:save": { maxRequests: 15, windowMs: 60 * 1000 },
  "domains:link": { maxRequests: 10, windowMs: 60 * 1000 },
  "domains:verify": { maxRequests: 15, windowMs: 60 * 1000 },
  "domains:check": { maxRequests: 20, windowMs: 60 * 1000 },
  "domains:whois": { maxRequests: 30, windowMs: 60 * 1000 },
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
  "inspector:capture": { maxRequests: 12, windowMs: 60 * 1000 },
  "inspector:element-map": { maxRequests: 20, windowMs: 60 * 1000 },
  "inspector:ai-match": { maxRequests: 10, windowMs: 60 * 1000 },
  read: { maxRequests: 150, windowMs: 60 * 1000 },
  default: { maxRequests: 90, windowMs: 60 * 1000 },
  "webhook:v0": { maxRequests: 180, windowMs: 60 * 1000 },
  "preview-session:create": { maxRequests: 15, windowMs: 60 * 1000 },
  "preview-session:status": { maxRequests: 60, windowMs: 60 * 1000 },
  "preview-session:heartbeat": { maxRequests: 120, windowMs: 60 * 1000 },
  "preview-session:hibernate": { maxRequests: 60, windowMs: 60 * 1000 },
  "preview-session:destroy": { maxRequests: 30, windowMs: 60 * 1000 },
  "csp:report": { maxRequests: 100, windowMs: 60 * 1000 },
  // v0 Platform API - separate limit to track v0 usage specifically
  "v0:generate": { maxRequests: 20, windowMs: 60 * 1000 },
  "v0:stream": { maxRequests: 30, windowMs: 60 * 1000 },
  // B1.4 — distinct buckets per route so a tight repair-loop on one chat
  // doesn't exhaust the budget for unrelated polls (deployment status,
  // readiness, etc.) on another chat.
  "v0:deployments-list": { maxRequests: 60, windowMs: 60 * 1000 },
  "v0:deployments-single": { maxRequests: 60, windowMs: 60 * 1000 },
  "v0:deployments-events": { maxRequests: 60, windowMs: 60 * 1000 },
  "engine:quality-gate": { maxRequests: 12, windowMs: 60 * 1000 },
  "engine:repair": { maxRequests: 12, windowMs: 60 * 1000 },
  "engine:readiness": { maxRequests: 60, windowMs: 60 * 1000 },
  // Polled by `useVersionStatus` (default 4s while a version is non-terminal).
  // 60/min matches engine:readiness — same client cadence pattern.
  "engine:version-status": { maxRequests: 60, windowMs: 60 * 1000 },
  "engine:product-postcheck": { maxRequests: 12, windowMs: 60 * 1000 },
  "preferences:get": { maxRequests: 60, windowMs: 60 * 1000 },
  "preferences:patch": { maxRequests: 20, windowMs: 60 * 1000 },
};

let _cachedRedis: Redis | null = null;
let _cachedRedisConfigKey: string | null = null;
const _cachedLimiters = new Map<string, Ratelimit>();

function isTruthyEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

function allowMemoryRateLimitFallback(): boolean {
  return !isProductionRuntime() || isTruthyEnv(process.env.SAJTMASKIN_RATE_LIMIT_ALLOW_MEMORY_IN_PROD);
}

function trustForwardedForHeader(): boolean {
  return !isProductionRuntime() || isTruthyEnv(process.env.SAJTMASKIN_TRUST_X_FORWARDED_FOR);
}

function resolveRedisCredentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url, token };
}

function getRedis(): { redis: Redis; cacheKey: string } | null {
  const creds = resolveRedisCredentials();
  if (!creds) {
    _cachedRedis = null;
    _cachedRedisConfigKey = null;
    return null;
  }

  const cacheKey = `${creds.url}:${creds.token}`;
  if (_cachedRedis && _cachedRedisConfigKey === cacheKey) {
    return { redis: _cachedRedis, cacheKey };
  }

  _cachedRedis = new Redis({ url: creds.url, token: creds.token });
  _cachedRedisConfigKey = cacheKey;
  return { redis: _cachedRedis, cacheKey };
}

function getLimiter(
  endpoint: string,
  limits: RateLimitConfig,
):
  | { mode: "upstash"; limiter: Ratelimit }
  | { mode: "memory" }
  | { mode: "unconfigured" } {
  const redisConnection = getRedis();
  if (!redisConnection) {
    return allowMemoryRateLimitFallback() ? { mode: "memory" } : { mode: "unconfigured" };
  }

  const key = `${redisConnection.cacheKey}:${endpoint}:${limits.maxRequests}:${limits.windowMs}`;
  const cached = _cachedLimiters.get(key);
  if (cached) return { mode: "upstash", limiter: cached };

  const limiter = new Ratelimit({
    redis: redisConnection.redis,
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

  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwardedIp = trustForwardedForHeader()
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    : null;
  const ip = realIp || forwardedIp || "unknown";

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

function createRateLimitHeaders(result: {
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
  } else if (limiter.mode === "unconfigured") {
    return new Response(
      JSON.stringify({
        error: "Rate limiting is not configured",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Mode": rateLimitMode,
        },
      },
    );
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
