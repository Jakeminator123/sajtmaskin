import "server-only";

import type { QueryParams } from "next-sanity";

import { getDraftSanityClient, getSanityClient } from "./client";

export type SanityFetchOptions = {
  query: string;
  params?: QueryParams;
  /** `drafts` requires SANITY_API_READ_TOKEN; defaults to published content. */
  perspective?: "published" | "drafts";
  /** Enables stega source-map encoding for Visual Editing overlays. */
  stega?: boolean;
};

/**
 * Query helper for published or draft content. Callers MUST check
 * `isSanityConfigured()` (and `isSanityDraftTokenConfigured()` for
 * `perspective: "drafts"`) before calling — this throws instead of
 * degrading, matching the `getDb()` contract in the database dossiers so the
 * seed-fallback branch stays explicit at the call site instead of hidden
 * inside this helper.
 */
export async function sanityFetch<T>({
  query,
  params = {},
  perspective = "published",
  stega = false,
}: SanityFetchOptions): Promise<T> {
  const client = perspective === "drafts" ? getDraftSanityClient() : getSanityClient();
  return client.fetch<T>(query, params, {
    perspective,
    stega,
    next: { tags: ["sanity"] },
  });
}
