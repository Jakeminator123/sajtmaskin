/**
 * Template Preview Cache
 * ======================
 *
 * Redis-backed cache for template previews with in-memory fallback.
 * Prevents excessive v0 API calls when multiple users preview the same template.
 *
 * CACHE STRATEGY:
 * - First preview: calls v0 API, caches result
 * - Subsequent previews: returns cached result
 * - TTL: 24 hours (templates don't change often)
 *
 * STORAGE:
 * - Primary: Redis (production, multi-instance)
 * - Fallback: In-memory Map (development, single-instance)
 */

import {
  cachePreview as redisCachePreview,
  getCachedPreview as redisGetCachedPreview,
  invalidatePreview as redisInvalidatePreview,
  CachedPreview as RedisCachedPreview,
} from "./redis";

// Local interface that matches existing usage
export interface CachedPreview {
  chatId: string;
  demoUrl: string | null;
  screenshotUrl: string | null;
  cachedAt: number;
}

// Cache TTL: 24 hours (in milliseconds) - for in-memory fallback
const CACHE_TTL = 60 * 60 * 1000 * 24;

// In-memory cache fallback (Map for O(1) lookups)
const previewCache = new Map<string, CachedPreview>();

/**
 * Get cached preview for a template
 * Tries Redis first, falls back to in-memory
 */
export async function getCachedPreview(
  templateId: string
): Promise<CachedPreview | null> {
  // Try Redis first
  try {
    const redisPreview = await redisGetCachedPreview(templateId);
    if (redisPreview) {
      console.log("[preview-cache] Redis cache hit for:", templateId);
      return {
        chatId: redisPreview.chatId,
        demoUrl: redisPreview.demoUrl || null,
        screenshotUrl: null, // Redis version doesn't store screenshot
        cachedAt: new Date(redisPreview.cachedAt).getTime(),
      };
    }
  } catch (error) {
    console.warn("[preview-cache] Redis read failed, using in-memory:", error);
  }

  // Fallback to in-memory
  const cached = previewCache.get(templateId);

  if (!cached) {
    return null;
  }

  // Check if expired
  const now = Date.now();
  if (now - cached.cachedAt > CACHE_TTL) {
    console.log("[preview-cache] Cache expired for:", templateId);
    previewCache.delete(templateId);
    return null;
  }

  console.log("[preview-cache] In-memory cache hit for:", templateId);
  return cached;
}

/**
 * Set cached preview for a template
 * Writes to both Redis and in-memory
 */
export async function setCachedPreview(
  templateId: string,
  preview: Omit<CachedPreview, "cachedAt">
): Promise<void> {
  const now = Date.now();
  const cachedPreview: CachedPreview = {
    ...preview,
    cachedAt: now,
  };

  console.log("[preview-cache] Caching preview for:", templateId);

  // Save to in-memory (always works)
  previewCache.set(templateId, cachedPreview);

  // Save to Redis (best-effort)
  try {
    const redisPreview: RedisCachedPreview = {
      templateId,
      chatId: preview.chatId,
      demoUrl: preview.demoUrl || "",
      versionId: "", // Not available in current usage
      cachedAt: new Date(now).toISOString(),
    };
    await redisCachePreview(redisPreview);
  } catch (error) {
    console.warn("[preview-cache] Redis write failed:", error);
  }
}

/**
 * Clear specific template from cache
 */
export async function clearCachedPreview(templateId: string): Promise<void> {
  previewCache.delete(templateId);

  try {
    await redisInvalidatePreview(templateId);
  } catch (error) {
    console.warn("[preview-cache] Redis clear failed:", error);
  }
}

/**
 * Clear all cached previews (in-memory only - Redis has TTL)
 */
export function clearAllCachedPreviews(): void {
  previewCache.clear();
  console.log("[preview-cache] All in-memory previews cleared");
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: previewCache.size,
    keys: Array.from(previewCache.keys()),
  };
}
