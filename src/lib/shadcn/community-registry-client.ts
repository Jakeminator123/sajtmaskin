/**
 * Client helpers for community registry proxy routes.
 * Keeps browser code free of Node Buffer / server-only fetch paths.
 */

import type { ShadcnRegistryItem } from "@/lib/shadcn/registry-types";
import type { CommunityIndexPage } from "@/lib/shadcn/community-registry-index";
import {
  FEATURED_SHADCNBLOCKS,
  SHADCNBLOCKS_NAMESPACE,
  featuredShadcnblockNames,
} from "@/lib/shadcn/community-registry-index";
import { isUsableRegistryItem } from "@/lib/shadcn/registry-service";

export type CommunityIndexClientQuery = {
  q?: string;
  category?: string;
  limit?: number;
  cursor?: string | null;
  names?: string[];
  force?: boolean;
};

export async function fetchCommunityIndexPage(
  query: CommunityIndexClientQuery = {},
): Promise<CommunityIndexPage> {
  const params = new URLSearchParams();
  params.set("namespace", SHADCNBLOCKS_NAMESPACE);
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.category?.trim()) params.set("category", query.category.trim());
  if (query.cursor?.trim()) params.set("cursor", query.cursor.trim());
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.names?.length) params.set("names", query.names.join(","));
  if (query.force) params.set("force", "1");

  const response = await fetch(`/api/shadcn/community/index?${params.toString()}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Kunde inte hämta marknadsblock (HTTP ${response.status})`);
  }
  return (await response.json()) as CommunityIndexPage;
}

export async function fetchFeaturedShadcnblocks(): Promise<CommunityIndexPage> {
  return fetchCommunityIndexPage({ names: featuredShadcnblockNames() });
}

export async function fetchCommunityRegistryItem(
  registry: string,
  name: string,
): Promise<ShadcnRegistryItem | null> {
  const params = new URLSearchParams({
    registry,
    name,
  });
  try {
    const response = await fetch(`/api/shadcn/community/item?${params.toString()}`);
    if (!response.ok) return null;
    const item = (await response.json()) as ShadcnRegistryItem;
    return isUsableRegistryItem(item) ? item : null;
  } catch {
    return null;
  }
}

export { FEATURED_SHADCNBLOCKS, SHADCNBLOCKS_NAMESPACE };
