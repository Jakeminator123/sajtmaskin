import "server-only";

import { createClient, type SanityClient } from "next-sanity";

import { apiVersion, dataset, isSanityConfigured, projectId, studioUrl } from "./api";
import { isSanityDraftTokenConfigured, token } from "./token";

/**
 * Lazy singleton clients, never constructed at module import time — a
 * missing `NEXT_PUBLIC_SANITY_PROJECT_ID` / `NEXT_PUBLIC_SANITY_DATASET`
 * must not crash the build or unrelated routes. Callers MUST check
 * `isSanityConfigured()` first; both factories throw otherwise so the
 * seed-fallback branch stays explicit at the call site (same contract as
 * `getDb()` in the database dossiers).
 */
const globalForSanity = globalThis as typeof globalThis & {
  __sanityPublicClient?: SanityClient;
  __sanityDraftClient?: SanityClient;
};

/**
 * Public, CDN-backed client for published content only. Never carries the
 * read token — safe to reuse from any server context that only needs
 * published documents.
 */
export function getSanityClient(): SanityClient {
  if (!isSanityConfigured()) {
    throw new Error(
      "Sanity is not configured (missing NEXT_PUBLIC_SANITY_PROJECT_ID / NEXT_PUBLIC_SANITY_DATASET). Check isSanityConfigured() before calling getSanityClient().",
    );
  }
  if (!globalForSanity.__sanityPublicClient) {
    globalForSanity.__sanityPublicClient = createClient({
      projectId,
      dataset,
      apiVersion,
      useCdn: true,
      stega: { studioUrl },
    });
  }
  return globalForSanity.__sanityPublicClient;
}

/**
 * Server-only draft client with the read token attached. Bypasses the CDN
 * (`useCdn: false`) because draft/unpublished documents are never served
 * from the CDN cache. Never import this from a client component — the
 * token module is `server-only`-guarded, and this factory doubles the
 * guard so the public and draft clients cannot be confused.
 */
export function getDraftSanityClient(): SanityClient {
  if (!isSanityConfigured()) {
    throw new Error(
      "Sanity is not configured (missing NEXT_PUBLIC_SANITY_PROJECT_ID / NEXT_PUBLIC_SANITY_DATASET). Check isSanityConfigured() before calling getDraftSanityClient().",
    );
  }
  if (!isSanityDraftTokenConfigured()) {
    throw new Error(
      "Sanity draft preview is not configured (missing or placeholder SANITY_API_TOKEN). Check isSanityDraftTokenConfigured() before calling getDraftSanityClient().",
    );
  }
  if (!globalForSanity.__sanityDraftClient) {
    globalForSanity.__sanityDraftClient = createClient({
      projectId,
      dataset,
      apiVersion,
      useCdn: false,
      token,
      stega: { studioUrl },
    });
  }
  return globalForSanity.__sanityDraftClient;
}
