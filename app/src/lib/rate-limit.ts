/**
 * Rate Limiting Utility
 *
 * Simple in-memory rate limiter for API routes.
 * In production, use Redis for distributed rate limiting.
 *
 * Usage:
 *   const limiter = rateLimit({ interval: 60000, limit: 10 });
 *   const { success, remaining } = await limiter.check(identifier);
 */

interface RateLimitConfig {
  interval: number; // Time window in milliseconds
  limit: number; // Max requests per interval
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store (use Redis in production for multi-instance)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
const CLEANUP_INTERVAL = 60000; // 1 minute
let cleanupTimer: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

export function rateLimit(config: RateLimitConfig) {
  startCleanup();

  return {
    /**
     * Check if request should be allowed
     * @param identifier - Unique identifier (IP, user ID, session ID)
     * @returns { success: boolean, remaining: number, reset: number }
     */
    check: async (
      identifier: string
    ): Promise<{
      success: boolean;
      remaining: number;
      reset: number;
    }> => {
      const now = Date.now();
      const key = identifier;

      let entry = rateLimitStore.get(key);

      // If no entry or expired, create new one
      if (!entry || entry.resetTime < now) {
        entry = {
          count: 0,
          resetTime: now + config.interval,
        };
      }

      // Increment count
      entry.count++;
      rateLimitStore.set(key, entry);

      const remaining = Math.max(0, config.limit - entry.count);
      const success = entry.count <= config.limit;

      return {
        success,
        remaining,
        reset: entry.resetTime,
      };
    },

    /**
     * Get current limit status without incrementing
     */
    status: async (
      identifier: string
    ): Promise<{
      count: number;
      remaining: number;
      reset: number;
    }> => {
      const now = Date.now();
      const entry = rateLimitStore.get(identifier);

      if (!entry || entry.resetTime < now) {
        return {
          count: 0,
          remaining: config.limit,
          reset: now + config.interval,
        };
      }

      return {
        count: entry.count,
        remaining: Math.max(0, config.limit - entry.count),
        reset: entry.resetTime,
      };
    },
  };
}

// Pre-configured limiters for different use cases
export const apiLimiter = rateLimit({
  interval: 60000, // 1 minute
  limit: 30, // 30 requests per minute
});

export const aiLimiter = rateLimit({
  interval: 60000, // 1 minute
  limit: 10, // 10 AI requests per minute (expensive operations)
});

export const uploadLimiter = rateLimit({
  interval: 3600000, // 1 hour
  limit: 50, // 50 uploads per hour
});

/**
 * Get client identifier from request
 * Prioritizes: User ID > Session ID > IP Address
 */
export function getClientIdentifier(request: Request): string {
  const headers = new Headers(request.headers);

  // Check for user session (future: from auth)
  const sessionId = headers.get("x-session-id");
  if (sessionId) {
    return `session:${sessionId}`;
  }

  // Check for forwarded IP (behind proxy/load balancer)
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0].trim();
    return `ip:${ip}`;
  }

  // Check for real IP header
  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return `ip:${realIp}`;
  }

  // Fallback to a hash of user-agent + accept-language
  const ua = headers.get("user-agent") || "";
  const lang = headers.get("accept-language") || "";
  const fingerprint = `${ua}:${lang}`;

  // Simple hash
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    hash = (hash << 5) - hash + fingerprint.charCodeAt(i);
    hash |= 0;
  }

  return `fingerprint:${hash}`;
}

