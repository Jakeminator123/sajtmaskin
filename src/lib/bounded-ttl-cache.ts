export type ExpiringCacheEntry = { expiresAt: number };

export function getFreshCacheEntry<T extends ExpiringCacheEntry>(
  store: Map<string, T>,
  key: string,
  now = Date.now(),
): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  return entry;
}

export function setBoundedCacheEntry<T extends ExpiringCacheEntry>(
  store: Map<string, T>,
  key: string,
  entry: Omit<T, "expiresAt">,
  options: { ttlMs: number; maxEntries: number; now?: number },
): void {
  const now = options.now ?? Date.now();
  for (const [storedKey, storedEntry] of store) {
    if (storedEntry.expiresAt <= now) store.delete(storedKey);
  }

  store.delete(key);
  const maxEntries = Math.max(1, Math.trunc(options.maxEntries));
  while (store.size >= maxEntries) {
    const oldestKey = store.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    store.delete(oldestKey);
  }
  store.set(key, { ...entry, expiresAt: now + options.ttlMs } as T);
}
