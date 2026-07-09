/**
 * Sanity project config, derived from env. Kept lean and dependency-free —
 * this file is imported by both server and client code paths, so pulling in
 * an SDK here would needlessly grow the client bundle.
 *
 * Unlike the upstream Sanity template, this module never throws at import
 * time: a missing project id / dataset must not crash the build or an
 * unrelated route. Call `isSanityConfigured()` before using
 * `getSanityClient()` / `sanityFetch()` and render the seed-fallback contract
 * (`seedContent` + `<SanityConfigNotice />`) when it returns false.
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
 * F2/preview seeds dossier env keys with stubs like
 * `next_public_sanity_project_id_placeholder_preview_not_real`; querying
 * Sanity with those yields 404s instead of the promised seed-fallback path,
 * so placeholder-marked values count as NOT configured. Mirrors the stub
 * vocabulary (`placeholder` / `not_real` / `dummy`).
 */
export function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|^your[_-]/i.test(trimmed);
}

/**
 * True once REAL config for ANY Sanity read (published or draft) is present.
 * Gate every Sanity-backed page/section and API route on this before calling
 * `getSanityClient()` / `sanityFetch()` — when it is false, render
 * `seedContent` from `@/lib/sanity/seed-content` with a discreet
 * `<SanityConfigNotice />` instead. Never crash the page and never surface a
 * raw error to visitors.
 */
export function isSanityConfigured(): boolean {
  return (
    !isPlaceholderValue(process.env.NEXT_PUBLIC_SANITY_PROJECT_ID) &&
    !isPlaceholderValue(process.env.NEXT_PUBLIC_SANITY_DATASET)
  );
}
