/**
 * Redis Client Configuration
 * ==========================
 *
 * Uses Redis Cloud for caching frequently accessed data.
 * Reduces database load and improves response times.
 *
 * REDIS KEY STRUCTURE:
 * ====================
 * All keys are prefixed with REDIS_KEY_PREFIX ("prod:" or "dev:")
 * so dev and prod never collide even on a shared instance.
 *
 * Rate Limiting (separat fil): se `src/lib/rateLimit.ts` — Upstash REST +
 * in-memory fallback. Denna fil hanterar inte rate-limit längre.
 *
 * General Cache:
 *   {prefix}cache:{key}                 → Any JSON (TTL: 1 hour default)
 *
 * Prompt Handoff:
 *   {prefix}prompt_handoff:{id}         → CachedPromptHandoff JSON (TTL: 7 days)
 *
 * Audit Caching:
 *   {prefix}audit:{auditId}             → Audit JSON (TTL: 24 hours)
 *   {prefix}audit_list:{userId}         → Audit list JSON (TTL: 24 hours)
 *
 * Preview session (optional cross-instance reuse; `docs/architecture/llm-pipeline.md`):
 *   {prefix}preview-session:session:{chatId} → PreviewSessionEntry JSON
 *     (idle 90 min / hard-cap 2h — source of truth: PREVIEW_SESSION_IDLE_MS /
 *      PREVIEW_SESSION_HARD_CAP_MS in src/lib/gen/preview/session-store.ts)
 */

import Redis from "ioredis";
import { REDIS_CONFIG, REDIS_KEY_PREFIX, FEATURES } from "@/lib/config";
import { debugLog } from "@/lib/utils/debug";

// Create Redis client (singleton)
let redisClient: Redis | null = null;
let redisDisabledLogged = false;
let redisMissingLogged = false;

export function getRedis(): Redis | null {
  // Skip if Redis not configured
  if (!FEATURES.useRedisCache) {
    if (!redisDisabledLogged) {
      console.warn("[Redis] Disabled: REDIS_URL or REDIS_HOST/REDIS_PASSWORD missing");
      redisDisabledLogged = true;
    }
    return null;
  }

  if (!redisClient) {
    try {
      const redisOptions = {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 10000,
        keepAlive: 30000,
      };
      const source = REDIS_CONFIG.url ? "url" : "host";
      debugLog("DB", "[Redis] Creating client", {
        host: REDIS_CONFIG.host,
        port: REDIS_CONFIG.port,
        username: REDIS_CONFIG.username,
        source,
      });
      const useTls = REDIS_CONFIG.url.startsWith("rediss://");

      redisClient = new Redis({
        host: REDIS_CONFIG.host,
        port: REDIS_CONFIG.port,
        username: REDIS_CONFIG.username,
        password: REDIS_CONFIG.password,
        ...(useTls ? { tls: {} } : {}),
        ...redisOptions,
      });

      redisClient.on("error", (err) => {
        console.error("[Redis] Connection error:", err.message);
      });

      redisClient.on("connect", () => {
        debugLog("DB", "[Redis] Connected");
      });

      redisClient.on("ready", () => {
        debugLog("DB", "[Redis] Ready");
      });
    } catch (error) {
      console.error("[Redis] Failed to create client:", error);
      return null;
    }
  }

  return redisClient;
}

// ============ General Cache ============

export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds: number = 3600,
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    if (!redisMissingLogged) {
      console.warn("[Redis] Cache skipped (no client)");
      redisMissingLogged = true;
    }
    return;
  }

  try {
    await redis.setex(`${REDIS_KEY_PREFIX}cache:${key}`, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error("[Redis] Failed to set cache:", error);
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) {
    if (!redisMissingLogged) {
      console.warn("[Redis] Cache read skipped (no client)");
      redisMissingLogged = true;
    }
    return null;
  }

  try {
    const data = await redis.get(`${REDIS_KEY_PREFIX}cache:${key}`);
    if (data) {
      return JSON.parse(data) as T;
    }
  } catch (error) {
    console.error("[Redis] Failed to get cache:", error);
  }
  return null;
}

export async function deleteCache(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(`${REDIS_KEY_PREFIX}cache:${key}`);
  } catch (error) {
    console.error("[Redis] Failed to delete cache:", error);
  }
}

// ============ Prompt Handoff ============

const PROMPT_HANDOFF_PREFIX = `${REDIS_KEY_PREFIX}prompt_handoff:`;
const PROMPT_HANDOFF_TTL = 60 * 60 * 24 * 7; // 7 days

export type CachedPromptHandoff = {
  id: string;
  prompt: string;
  source?: string | null;
  projectId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  createdAt?: string | null;
};

export async function cachePromptHandoff(data: CachedPromptHandoff): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.setex(
      `${PROMPT_HANDOFF_PREFIX}${data.id}`,
      PROMPT_HANDOFF_TTL,
      JSON.stringify(data),
    );
  } catch (error) {
    console.error("[Redis] Failed to cache prompt handoff:", error);
  }
}

export async function getCachedPromptHandoff(id: string): Promise<CachedPromptHandoff | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const data = await redis.get(`${PROMPT_HANDOFF_PREFIX}${id}`);
    if (data) {
      return JSON.parse(data) as CachedPromptHandoff;
    }
  } catch (error) {
    console.error("[Redis] Failed to get cached prompt handoff:", error);
  }
  return null;
}

export async function deletePromptHandoffCache(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(`${PROMPT_HANDOFF_PREFIX}${id}`);
  } catch (error) {
    console.error("[Redis] Failed to delete prompt handoff cache:", error);
  }
}

// ============ Audit Caching ============

const AUDIT_CACHE_PREFIX = `${REDIS_KEY_PREFIX}audit:`;
const AUDIT_LIST_PREFIX = `${REDIS_KEY_PREFIX}audit_list:`;
const AUDIT_CACHE_TTL = 86400; // 24 hours

/**
 * Cache a single audit result
 */
export async function cacheAudit(
  auditId: number,
  userId: string,
  auditData: Record<string, unknown>,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.setex(
      `${AUDIT_CACHE_PREFIX}${auditId}`,
      AUDIT_CACHE_TTL,
      JSON.stringify(auditData),
    );
    // Invalidate user's audit list cache
    await redis.del(`${AUDIT_LIST_PREFIX}${userId}`);
  } catch (error) {
    console.error("[Redis] Failed to cache audit:", error);
  }
}

/**
 * Get cached audit by ID
 */
export async function getCachedAudit(auditId: number): Promise<Record<string, unknown> | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get(`${AUDIT_CACHE_PREFIX}${auditId}`);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("[Redis] Failed to get cached audit:", error);
  }
  return null;
}

/**
 * Cache user's audit list (lightweight metadata only)
 */
export async function cacheUserAuditList(
  userId: string,
  audits: Array<{
    id: number;
    domain: string;
    company_name: string | null;
    score_overall: number | null;
    created_at: string;
  }>,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.setex(`${AUDIT_LIST_PREFIX}${userId}`, AUDIT_CACHE_TTL, JSON.stringify(audits));
  } catch (error) {
    console.error("[Redis] Failed to cache audit list:", error);
  }
}

/**
 * Get cached user audit list
 */
export async function getCachedUserAuditList(userId: string): Promise<Array<{
  id: number;
  domain: string;
  company_name: string | null;
  score_overall: number | null;
  created_at: string;
}> | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get(`${AUDIT_LIST_PREFIX}${userId}`);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("[Redis] Failed to get cached audit list:", error);
  }
  return null;
}

/**
 * Invalidate audit caches for a user
 */
export async function invalidateUserAuditCache(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(`${AUDIT_LIST_PREFIX}${userId}`);
  } catch (error) {
    console.error("[Redis] Failed to invalidate audit cache:", error);
  }
}

// ============ Admin Operations ============

export async function getRedisInfo(): Promise<{
  connected: boolean;
  memoryUsed?: string;
  totalKeys?: number;
  uptime?: number;
} | null> {
  const redis = getRedis();
  if (!redis) {
    return { connected: false };
  }

  try {
    const info = await redis.info();
    const dbSize = await redis.dbsize();

    // Parse memory from info
    const memMatch = info.match(/used_memory_human:(\S+)/);
    const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/);

    return {
      connected: true,
      memoryUsed: memMatch?.[1] || "unknown",
      totalKeys: dbSize,
      uptime: uptimeMatch ? parseInt(uptimeMatch[1]) : undefined,
    };
  } catch (error) {
    console.error("[Redis] Failed to get info:", error);
    return { connected: false };
  }
}

/**
 * Rensa cache för **denna miljö** (`REDIS_KEY_PREFIX`-scoped).
 *
 * BUG-FIX 2026-04-24: tidigare gjorde denna funktion `FLUSHDB` som rensar
 * HELA logical Redis-databasen — vilket betyder att en admin-knapp i dev
 * skulle radera prod-cachen också (Upstash-instansen delas mellan miljöer
 * och bara `REDIS_KEY_PREFIX` separerar dem).
 *
 * Nu skannar vi `${REDIS_KEY_PREFIX}*` med SCAN och raderar matchande
 * nycklar i batchar via UNLINK (icke-blockerande, samma som DEL men async
 * från Redis perspektiv). Andra miljöers nycklar lämnas helt orörda.
 *
 * Säkerhetsmarginal: hård cap på 100k nycklar per anrop. Om någon avsiktligt
 * vill köra "stor flush" kan de upprepa anropet — men en oavsiktlig knapp-
 * tryckning kan inte rensa miljontals nycklar i en runda.
 *
 * Returns: antal raderade nycklar (eller -1 vid fel).
 */
export async function flushRedisCache(): Promise<number> {
  const redis = getRedis();
  if (!redis) return -1;

  const SCOPE = `${REDIS_KEY_PREFIX}*`;
  const HARD_CAP = 100_000;
  const BATCH = 500;

  let cursor = "0";
  let deleted = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 1000;

  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", SCOPE, "COUNT", BATCH);
      cursor = nextCursor;

      if (keys.length > 0) {
        // UNLINK = icke-blockerande DEL (frigör i bakgrundstråd). Faller
        // tillbaka till DEL om Redis-versionen är < 4.0 — inte aktuellt
        // för Upstash men säkert ändå.
        try {
          deleted += await redis.unlink(...keys);
        } catch (unlinkErr) {
          // BUG-FIX 2026-04-24 (test-agent #4): tidigare svalde `catch {}`
          // alla fel inklusive auth/timeout/WRONGTYPE. Logga orsaken så vi
          // ser i loggar varför fallback triggade — och om DEL ALSO failar
          // bubblar det upp till outer catch (som returnerar -1).
          console.warn(
            `[Redis] UNLINK failed (${unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr)}); falling back to DEL.`,
          );
          deleted += await redis.del(...keys);
        }
      }

      if (deleted >= HARD_CAP) {
        console.warn(
          `[Redis] flushRedisCache hit HARD_CAP (${HARD_CAP}); stopping. Re-run if more keys remain.`,
        );
        break;
      }
      iterations += 1;
      if (iterations >= MAX_ITERATIONS) {
        console.warn(
          `[Redis] flushRedisCache hit MAX_ITERATIONS (${MAX_ITERATIONS}); stopping.`,
        );
        break;
      }
    } while (cursor !== "0");

    console.info(`[Redis] Flushed ${deleted} keys matching ${SCOPE}`);
    return deleted;
  } catch (error) {
    console.error("[Redis] Failed to flush prefix-scoped cache:", error);
    return -1;
  }
}
