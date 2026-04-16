import { rewriteRegistryImports } from "@/lib/shadcn/registry-utils";
import {
  getRegistryBaseUrl,
  getStyleFallbackChain,
} from "@/lib/shadcn/registry-url";
import type { ComponentReference } from "./shadcn-example-loader";

const FETCH_TIMEOUT_MS = 2000;
const MAX_REMOTE_FETCHES = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  ref: ComponentReference | null;
  ts: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(name: string): ComponentReference | null | undefined {
  const entry = cache.get(name);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(name);
    return undefined;
  }
  return entry.ref;
}

function setCache(name: string, ref: ComponentReference | null): void {
  cache.set(name, { ref, ts: Date.now() });
}

function buildItemUrl(name: string, style: string): string {
  const base = getRegistryBaseUrl();
  return `${base}/r/styles/${encodeURIComponent(style)}/${encodeURIComponent(name)}.json`;
}

interface RegistryFile {
  path: string;
  content?: string;
}

interface RegistryItemResponse {
  name: string;
  title?: string;
  files?: RegistryFile[];
}

async function fetchOneExample(name: string): Promise<ComponentReference | null> {
  const styles = getStyleFallbackChain();

  for (const s of styles) {
    const url = buildItemUrl(name, s);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) continue;
      const data = (await res.json()) as RegistryItemResponse;
      const tsxFile = data.files?.find(
        (f) => f.content && (f.path.endsWith(".tsx") || f.path.endsWith(".ts")),
      );
      if (!tsxFile?.content) continue;
      const code = rewriteRegistryImports(tsxFile.content, s);
      return { name: data.name || name, code };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Fetch registry examples for names not found in the local cache.
 * Returns only the newly fetched refs (caller merges with local results).
 * Max MAX_REMOTE_FETCHES fetches per call; silent fallback to empty on network errors.
 */
export async function fetchMissingRegistryExamples(
  allNames: string[],
  localResults: ComponentReference[],
): Promise<ComponentReference[]> {
  const localNames = new Set(localResults.map((r) => r.name));
  const missing = allNames.filter((n) => !localNames.has(n));
  if (missing.length === 0) return [];

  const toFetch = missing.slice(0, MAX_REMOTE_FETCHES);
  const results: ComponentReference[] = [];

  for (const name of toFetch) {
    const cached = getCached(name);
    if (cached !== undefined) {
      if (cached) results.push(cached);
      continue;
    }
    const ref = await fetchOneExample(name);
    setCache(name, ref);
    if (ref) results.push(ref);
  }

  return results;
}
