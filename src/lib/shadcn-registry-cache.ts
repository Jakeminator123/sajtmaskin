import { and, eq } from "drizzle-orm";
import { db, dbConfigured } from "@/lib/db/client";
import { registryCache } from "@/lib/db/schema";
import type { RegistryIndex, RegistryIndexItem } from "@/lib/shadcn-registry-service";
import { getRegistryBaseUrl, resolveRegistryStyle } from "@/lib/v0/v0-url-parser";

export type RegistrySource = "official" | "legacy";

export type RegistryCacheScope = {
  baseUrl: string;
  style?: string;
  source?: RegistrySource;
};

export type RegistryCacheResult = {
  index: RegistryIndex;
  itemStatus: Record<string, boolean>;
  fetchedAt: Date;
  stale: boolean;
  scope: Required<RegistryCacheScope>;
};

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const ITEM_CHECK_CONCURRENCY = 8;
const LEGACY_STYLE_DEFAULT = "new-york";

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimmed;
  }
}

function normalizeScope(scope: RegistryCacheScope): Required<RegistryCacheScope> {
  const baseUrl = normalizeBaseUrl(scope.baseUrl || getRegistryBaseUrl());
  const source = scope.source || "official";
  const style =
    source === "legacy"
      ? (scope.style?.trim() || LEGACY_STYLE_DEFAULT)
      : resolveRegistryStyle(scope.style, baseUrl);
  return { baseUrl, style, source };
}

function buildRegistryIndexUrl(scope: Required<RegistryCacheScope>): string {
  return `${scope.baseUrl}/r/styles/${encodeURIComponent(scope.style)}/registry.json`;
}

function buildRegistryItemUrl(scope: Required<RegistryCacheScope>, name: string): string {
  return `${scope.baseUrl}/r/styles/${encodeURIComponent(scope.style)}/${encodeURIComponent(name)}.json`;
}

function isStale(fetchedAt: Date | null | undefined): boolean {
  if (!fetchedAt) return true;
  return Date.now() - fetchedAt.getTime() > CACHE_TTL_MS;
}

function buildRegistryHeaders(): Record<string, string> {
  const token = process.env.REGISTRY_AUTH_TOKEN?.trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function fetchRegistryIndexRemote(
  scope: Required<RegistryCacheScope>,
): Promise<RegistryIndex> {
  const url = buildRegistryIndexUrl(scope);
  const response = await fetch(url, { headers: buildRegistryHeaders() });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Registry index HTTP ${response.status}${text ? ` - ${text}` : ""}`);
  }
  const data = (await response.json()) as RegistryIndex;
  if (!data || !Array.isArray(data.items)) {
    throw new Error("Registry index response saknar items");
  }
  return data;
}

async function checkItemExists(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: "HEAD", headers: buildRegistryHeaders() });
    if (head.ok) return true;
    if (head.status !== 405 && head.status !== 400) return false;
  } catch {
    // Fall through to GET as fallback
  }
  try {
    const res = await fetch(url, { headers: buildRegistryHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

async function buildItemStatusMap(
  scope: Required<RegistryCacheScope>,
  items: RegistryIndexItem[],
): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {};
  let idx = 0;
  const workers = Array.from({ length: ITEM_CHECK_CONCURRENCY }, async () => {
    while (idx < items.length) {
      const current = items[idx];
      idx += 1;
      if (!current?.name) continue;
      const url = buildRegistryItemUrl(scope, current.name);
      status[current.name] = await checkItemExists(url);
    }
  });
  await Promise.all(workers);
  return status;
}

export function filterRegistryIndexByStatus(
  index: RegistryIndex,
  itemStatus: Record<string, boolean>,
): RegistryIndex {
  return {
    ...index,
    items: index.items.filter((item) => itemStatus[item.name] !== false),
  };
}

export async function getRegistryCache(
  scope: RegistryCacheScope,
): Promise<RegistryCacheResult | null> {
  if (!dbConfigured) return null;
  const normalized = normalizeScope(scope);
  const rows = await db
    .select()
    .from(registryCache)
    .where(
      and(
        eq(registryCache.base_url, normalized.baseUrl),
        eq(registryCache.style, normalized.style),
        eq(registryCache.source, normalized.source),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    index: row.index_json as RegistryIndex,
    itemStatus: (row.item_status as Record<string, boolean>) || {},
    fetchedAt: row.fetched_at as Date,
    stale: isStale(row.fetched_at as Date),
    scope: normalized,
  };
}

export async function refreshRegistryCache(
  scope: RegistryCacheScope,
): Promise<RegistryCacheResult> {
  const normalized = normalizeScope(scope);
  const index = await fetchRegistryIndexRemote(normalized);
  const itemStatus = await buildItemStatusMap(normalized, index.items || []);
  const now = new Date();

  if (dbConfigured) {
    await db
      .insert(registryCache)
      .values({
        base_url: normalized.baseUrl,
        style: normalized.style,
        source: normalized.source,
        index_json: index,
        item_status: itemStatus,
        fetched_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: [registryCache.base_url, registryCache.style, registryCache.source],
        set: {
          index_json: index,
          item_status: itemStatus,
          fetched_at: now,
          updated_at: now,
        },
      });
  }

  return {
    index,
    itemStatus,
    fetchedAt: now,
    stale: false,
    scope: normalized,
  };
}

export async function getRegistryIndexWithCache(
  scope: RegistryCacheScope,
  options: { force?: boolean } = {},
): Promise<RegistryCacheResult> {
  const normalized = normalizeScope(scope);
  const force = Boolean(options.force);

  if (!dbConfigured) {
    const index = await fetchRegistryIndexRemote(normalized);
    const itemStatus = await buildItemStatusMap(normalized, index.items || []);
    return {
      index,
      itemStatus,
      fetchedAt: new Date(),
      stale: false,
      scope: normalized,
    };
  }

  const cached = await getRegistryCache(normalized);
  if (!cached || force) {
    return refreshRegistryCache(normalized);
  }

  if (cached.stale) {
    refreshRegistryCache(normalized).catch((err) => {
      console.error("[registry-cache] refresh failed:", err);
    });
  }

  return cached;
}

export function getDefaultRegistryScopes(): Required<RegistryCacheScope>[] {
  const baseUrl = normalizeBaseUrl(getRegistryBaseUrl());
  const official = normalizeScope({ baseUrl, source: "official" });
  if (!baseUrl.includes("ui.shadcn.com")) {
    return [official];
  }
  const legacy = normalizeScope({ baseUrl, source: "legacy" });
  return [official, legacy];
}
