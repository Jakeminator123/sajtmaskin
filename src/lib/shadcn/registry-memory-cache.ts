/**
 * In-memory TTL cache for shadcn registry index/item fetches.
 *
 * Extracted from `registry-service.ts` to fix two issues:
 *  - **G#61 / U#33** — the cache was an unbounded `Map`; distinct
 *    style/source/name combinations grew it without limit. Now bounded by
 *    `MAX_CACHE_ENTRIES` with oldest-first eviction.
 *  - **G#62 / U#34** — cache keys were built from the raw `style`/`name`
 *    strings, so casing/whitespace variants (`"New York"`, `"new york "`,
 *    `"new-york"`) produced duplicate entries for the same logical lookup.
 *    Keys are now normalized (trim + lowercase) via `buildRegistryCacheKey`.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
/** Upper bound on simultaneously cached registry entries (index + item). */
const MAX_CACHE_ENTRIES = 256;

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const store = new Map<string, CacheEntry>();

/** Normalize a cache-key component so casing/whitespace variants collapse. */
export function normalizeCacheKeyPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Build a normalized cache key for a registry lookup. `style` defaults to
 * `"default"` and `source` to `"official"` when empty — matching the prior
 * inline key format but with normalization applied.
 */
export function buildRegistryCacheKey(
  kind: "index" | "item",
  parts: { name?: string | null; style?: string | null; source?: string | null },
): string {
  const style = normalizeCacheKeyPart(parts.style) || "default";
  const source = normalizeCacheKeyPart(parts.source) || "official";
  if (kind === "item") {
    const name = normalizeCacheKeyPart(parts.name);
    return `item:${name}:${style}:${source}`;
  }
  return `index:${style}:${source}`;
}

export function getRegistryMemoryCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setRegistryMemoryCache<T>(key: string, data: T): void {
  // Refresh insertion order so the most-recently-written key is "newest".
  store.delete(key);
  store.set(key, { data, timestamp: Date.now() });
  // Evict oldest entries (Map preserves insertion order) until within bound.
  while (store.size > MAX_CACHE_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/** Test/maintenance helper: drop all cached entries. */
export function clearRegistryMemoryCache(): void {
  store.clear();
}

/** Test/maintenance helper: current number of cached entries. */
export function registryMemoryCacheSize(): number {
  return store.size;
}

export const REGISTRY_MEMORY_CACHE_MAX_ENTRIES = MAX_CACHE_ENTRIES;
export const REGISTRY_MEMORY_CACHE_TTL_MS = CACHE_TTL_MS;
