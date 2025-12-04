/**
 * Redis Client Configuration
 *
 * Uses Redis Cloud for caching user sessions and frequently accessed data.
 * Reduces database load and improves response times.
 */

import Redis from "ioredis";

// Redis configuration from environment variables
const REDIS_HOST =
  process.env.REDIS_HOST ||
  "redis-12352.fcrce259.eu-central-1-3.ec2.cloud.redislabs.com";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "12352");
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || "";
const REDIS_USERNAME = process.env.REDIS_USERNAME || "default";

// Create Redis client (singleton)
let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  // Skip if no password configured (development without Redis)
  if (!REDIS_PASSWORD) {
    console.log("[Redis] No password configured, skipping Redis connection");
    return null;
  }

  if (!redisClient) {
    try {
      redisClient = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        username: REDIS_USERNAME,
        password: REDIS_PASSWORD,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true,
        // Connection timeout
        connectTimeout: 10000,
        // Keep alive
        keepAlive: 30000,
      });

      redisClient.on("error", (err) => {
        console.error("[Redis] Connection error:", err.message);
      });

      redisClient.on("connect", () => {
        console.log("[Redis] Connected successfully");
      });

      redisClient.on("ready", () => {
        console.log("[Redis] Ready to accept commands");
      });
    } catch (error) {
      console.error("[Redis] Failed to create client:", error);
      return null;
    }
  }

  return redisClient;
}

// ============ User Session Cache ============

const USER_SESSION_PREFIX = "user:session:";
const USER_SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export interface CachedUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  diamonds: number;
  provider: string;
}

// Cache user session
export async function cacheUserSession(
  userId: string,
  user: CachedUser
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.setex(
      `${USER_SESSION_PREFIX}${userId}`,
      USER_SESSION_TTL,
      JSON.stringify(user)
    );
  } catch (error) {
    console.error("[Redis] Failed to cache user session:", error);
  }
}

// Get cached user session
export async function getCachedUserSession(
  userId: string
): Promise<CachedUser | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get(`${USER_SESSION_PREFIX}${userId}`);
    if (data) {
      return JSON.parse(data) as CachedUser;
    }
  } catch (error) {
    console.error("[Redis] Failed to get cached user session:", error);
  }
  return null;
}

// Invalidate user session cache
export async function invalidateUserSession(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(`${USER_SESSION_PREFIX}${userId}`);
  } catch (error) {
    console.error("[Redis] Failed to invalidate user session:", error);
  }
}

// Update cached user diamonds
export async function updateCachedUserDiamonds(
  userId: string,
  diamonds: number
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const data = await redis.get(`${USER_SESSION_PREFIX}${userId}`);
    if (data) {
      const user = JSON.parse(data) as CachedUser;
      user.diamonds = diamonds;
      await redis.setex(
        `${USER_SESSION_PREFIX}${userId}`,
        USER_SESSION_TTL,
        JSON.stringify(user)
      );
    }
  } catch (error) {
    console.error("[Redis] Failed to update cached diamonds:", error);
  }
}

// ============ Rate Limiting ============

const RATE_LIMIT_PREFIX = "ratelimit:";

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const redis = getRedis();

  // If no Redis, allow all requests
  if (!redis) {
    return { allowed: true, remaining: maxRequests, resetIn: 0 };
  }

  const redisKey = `${RATE_LIMIT_PREFIX}${key}`;

  try {
    const current = await redis.incr(redisKey);

    if (current === 1) {
      // First request, set expiry
      await redis.expire(redisKey, windowSeconds);
    }

    const ttl = await redis.ttl(redisKey);
    const remaining = Math.max(0, maxRequests - current);

    return {
      allowed: current <= maxRequests,
      remaining,
      resetIn: ttl > 0 ? ttl : windowSeconds,
    };
  } catch (error) {
    console.error("[Redis] Rate limit check failed:", error);
    // On error, allow the request
    return { allowed: true, remaining: maxRequests, resetIn: 0 };
  }
}

// ============ General Cache ============

export async function setCache(
  key: string,
  value: any,
  ttlSeconds: number = 3600
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.setex(`cache:${key}`, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error("[Redis] Failed to set cache:", error);
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get(`cache:${key}`);
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
    await redis.del(`cache:${key}`);
  } catch (error) {
    console.error("[Redis] Failed to delete cache:", error);
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

export async function flushRedisCache(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    await redis.flushdb();
    console.log("[Redis] Cache flushed");
    return true;
  } catch (error) {
    console.error("[Redis] Failed to flush cache:", error);
    return false;
  }
}

// ============ Cleanup ============

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
