/**
 * Sanity project config, derived from env. Kept lean and dependency-free —
 * this file is imported by both server and client code paths, so pulling in
 * an SDK here would needlessly grow the client bundle.
 *
 * Unlike the upstream Sanity template, these exports never throw at import
 * time: a missing project id / dataset must not crash the build or an
 * unrelated route. Call `isSanityConfigured()` before using `getSanityClient()`
 * / `sanityFetch()` and render the seed-fallback contract (see
 * `components/sanity-config-notice.tsx`) when it returns false.
 */

export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "";

export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "";

/** See https://www.sanity.io/docs/api-versioning for how versioning works. */
export const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-09-25";

/**
 * Used to configure edit-intent links for Presentation Mode, and where the
 * separate Studio app is hosted.
 */
export const studioUrl = process.env.NEXT_PUBLIC_SANITY_STUDIO_URL || "http://localhost:3333";

/**
 * True once the minimum config for ANY Sanity read (published or draft) is
 * present. Gate every Sanity-backed page/section and API route on this
 * before calling `getSanityClient()` / `sanityFetch()` — when it is false,
 * render static example content + `<SanityConfigNotice />` instead.
 */
export function isSanityConfigured(): boolean {
  return dataset.trim().length > 0 && projectId.trim().length > 0;
}
