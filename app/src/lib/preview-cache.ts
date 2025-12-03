/**
 * Template Preview Cache
 * ======================
 *
 * Simple in-memory cache for template previews.
 * Prevents excessive v0 API calls when multiple users preview the same template.
 *
 * CACHE STRATEGY:
 * - First preview: calls v0 API, caches result
 * - Subsequent previews: returns cached result
 * - TTL: 1 hour (templates don't change often)
 *
 * PRODUCTION NOTE:
 * For production with multiple instances, replace this with Redis.
 * See ev_iro_ment.txt for Redis configuration.
 */

export interface CachedPreview {
  chatId: string;
  demoUrl: string | null;
  screenshotUrl: string | null;
  cachedAt: number;
}

// Cache TTL: 1 hour (in milliseconds)
const CACHE_TTL = 60 * 60 * 1000;

// In-memory cache (Map for O(1) lookups)
const previewCache = new Map<string, CachedPreview>();

/**
 * Get cached preview for a template
 * Returns null if not cached or expired
 */
export function getCachedPreview(templateId: string): CachedPreview | null {
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

  console.log("[preview-cache] Cache hit for:", templateId);
  return cached;
}

/**
 * Set cached preview for a template
 */
export function setCachedPreview(
  templateId: string,
  preview: Omit<CachedPreview, "cachedAt">
): void {
  console.log("[preview-cache] Caching preview for:", templateId);
  previewCache.set(templateId, {
    ...preview,
    cachedAt: Date.now(),
  });
}

/**
 * Clear specific template from cache
 */
export function clearCachedPreview(templateId: string): void {
  previewCache.delete(templateId);
}

/**
 * Clear all cached previews
 */
export function clearAllCachedPreviews(): void {
  previewCache.clear();
  console.log("[preview-cache] All previews cleared");
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
