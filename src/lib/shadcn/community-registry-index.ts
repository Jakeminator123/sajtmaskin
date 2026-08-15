/**
 * Community registry index (shadcnblocks)
 * ======================================
 *
 * Publikt index: `GET https://www.shadcnblocks.com/r/registry.json`
 * (ingen API-nyckel). Stripping av `files` + server-side sök/paginering så
 * klienten aldrig får ~1800 råa poster. Item-hydrering (Pro) ägs av
 * `community-registry-fetch.ts` + `/api/shadcn/community/item`.
 */

import { buildCommunityRegistryRequest } from "@/lib/shadcn/community-registry-fetch";
import {
  SHADCNBLOCKS_NAMESPACE,
  categoryFromCommunityName,
  categoryLabelSv,
  type CommunityIndexItem,
  type CommunityIndexCategory,
  type CommunityIndexQuery,
  type CommunityIndexPage,
} from "@/lib/shadcn/community-registry-catalog";

export {
  SHADCNBLOCKS_NAMESPACE,
  FEATURED_SHADCNBLOCKS,
  featuredShadcnblockNames,
  categoryFromCommunityName,
  categoryLabelSv,
} from "@/lib/shadcn/community-registry-catalog";
export type {
  CommunityIndexItem,
  CommunityIndexCategory,
  CommunityIndexQuery,
  CommunityIndexPage,
  FeaturedShadcnblockId,
} from "@/lib/shadcn/community-registry-catalog";

export const SHADCNBLOCKS_INDEX_URL = "https://www.shadcnblocks.com/r/registry.json";

const INDEX_TIMEOUT_MS = 12_000;
const INDEX_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 h
const DEFAULT_PAGE_LIMIT = 24;
const MAX_PAGE_LIMIT = 48;
/** `names=` skips pagination — keep the list at featured-set scale. */
export const MAX_COMMUNITY_INDEX_NAMES = 32;

/** Trim, drop empties, and cap `names=` so featured resolve cannot dump the index. */
export function capCommunityIndexNames(names: string[] | undefined): string[] | undefined {
  if (!names?.length) return undefined;
  const capped = names
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, MAX_COMMUNITY_INDEX_NAMES);
  return capped.length > 0 ? capped : undefined;
}

type RawIndexItem = {
  name?: unknown;
  type?: unknown;
  title?: unknown;
  description?: unknown;
  categories?: unknown;
};

type CachedIndex = {
  fetchedAt: number;
  items: CommunityIndexItem[];
};

let memoryCache: CachedIndex | null = null;

export function normalizeCommunityIndexItem(raw: RawIndexItem): CommunityIndexItem | null {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  const type = typeof raw.type === "string" && raw.type.trim() ? raw.type.trim() : "registry:block";
  const title =
    typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : name;
  const description =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim()
      : "";
  const fromArray =
    Array.isArray(raw.categories) && typeof raw.categories[0] === "string"
      ? String(raw.categories[0]).trim().toLowerCase()
      : "";
  const category = fromArray || categoryFromCommunityName(name);
  return { name, type, title, description, category };
}

/** Strip heavy `files` payloads and keep gallery fields only. */
export function parseCommunityRegistryIndex(payload: unknown): CommunityIndexItem[] {
  const root = payload as { items?: unknown } | unknown[];
  const rawItems = Array.isArray(root)
    ? root
    : root && typeof root === "object" && Array.isArray((root as { items?: unknown }).items)
      ? ((root as { items: unknown[] }).items)
      : null;
  if (!rawItems) {
    throw new Error("Community registry index saknar items");
  }
  const out: CommunityIndexItem[] = [];
  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object") continue;
    const normalized = normalizeCommunityIndexItem(entry as RawIndexItem);
    if (normalized) out.push(normalized);
  }
  return out;
}

function buildCategories(items: CommunityIndexItem[]): CommunityIndexCategory[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: categoryLabelSv(id), count }))
    .sort((a, b) => a.label.localeCompare(b.label, "sv"));
}

function encodeCursor(offset: number): string {
  const raw = String(offset);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(raw, "utf8").toString("base64url");
  }
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor?.trim()) return 0;
  try {
    const trimmed = cursor.trim();
    const raw =
      typeof Buffer !== "undefined"
        ? Buffer.from(trimmed, "base64url").toString("utf8")
        : atob(trimmed.replace(/-/g, "+").replace(/_/g, "/"));
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function filterCommunityIndexItems(
  items: CommunityIndexItem[],
  query: CommunityIndexQuery,
): CommunityIndexItem[] {
  const q = query.q?.trim().toLowerCase() ?? "";
  const category = query.category?.trim().toLowerCase() ?? "";
  let filtered = items;
  if (category) {
    filtered = filtered.filter((item) => item.category === category);
  }
  if (q) {
    filtered = filtered.filter((item) => {
      const hay = `${item.name} ${item.title} ${item.description}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if (query.names && query.names.length > 0) {
    const wanted = new Set(query.names.map((n) => n.trim().toLowerCase()).filter(Boolean));
    filtered = filtered.filter((item) => wanted.has(item.name.toLowerCase()));
  }
  return filtered;
}

export function paginateCommunityIndexItems(
  items: CommunityIndexItem[],
  query: CommunityIndexQuery,
): Pick<CommunityIndexPage, "items" | "nextCursor" | "total"> {
  const limit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, query.limit ?? DEFAULT_PAGE_LIMIT),
  );
  const offset = decodeCursor(query.cursor);
  const slice = items.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  return {
    total: items.length,
    items: slice,
    nextCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null,
  };
}

export function clearCommunityRegistryIndexCache(): void {
  memoryCache = null;
}

async function fetchRemoteIndex(): Promise<CommunityIndexItem[]> {
  const request = buildCommunityRegistryRequest(SHADCNBLOCKS_INDEX_URL, {
    signal: AbortSignal.timeout(INDEX_TIMEOUT_MS),
  });
  // Index is public — do not require auth. buildCommunityRegistryRequest may
  // still attach Bearer when the key is set; that is fine for www.
  const response = await fetch(request.url, request.init);
  if (!response.ok) {
    throw new Error(`Community registry index HTTP ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  return parseCommunityRegistryIndex(payload);
}

export async function getCommunityRegistryIndexItems(options?: {
  force?: boolean;
}): Promise<CommunityIndexItem[]> {
  if (!options?.force && memoryCache && Date.now() - memoryCache.fetchedAt < INDEX_CACHE_TTL_MS) {
    return memoryCache.items;
  }
  const items = await fetchRemoteIndex();
  memoryCache = { fetchedAt: Date.now(), items };
  return items;
}

export async function queryCommunityRegistryIndex(
  query: CommunityIndexQuery = {},
  options?: { force?: boolean },
): Promise<CommunityIndexPage> {
  const names = capCommunityIndexNames(query.names);
  const boundedQuery = names ? { ...query, names } : { ...query, names: undefined };
  const all = await getCommunityRegistryIndexItems(options);
  const filtered = filterCommunityIndexItems(all, boundedQuery);
  // When resolving an explicit name list (featured cards), return those rows
  // without pagination — callers expect the full featured set (≤ cap).
  if (names && names.length > 0) {
    return {
      namespace: SHADCNBLOCKS_NAMESPACE,
      total: filtered.length,
      categories: buildCategories(all),
      items: filtered,
      nextCursor: null,
    };
  }
  const page = paginateCommunityIndexItems(filtered, query);
  return {
    namespace: SHADCNBLOCKS_NAMESPACE,
    total: page.total,
    categories: buildCategories(all),
    items: page.items,
    nextCursor: page.nextCursor,
  };
}
