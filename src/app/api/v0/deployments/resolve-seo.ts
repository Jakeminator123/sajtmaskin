/**
 * Pure precedence helper for the deploy route's SEO resolution.
 *
 * Extracted from `route.ts` so it can be unit-tested without paying the
 * cost of importing the entire deploy handler (db-client, gateway,
 * vercel-sdk, etc.). The route re-exports this function to keep the
 * existing public surface unchanged.
 *
 * Opt-in/brand precedence:
 *   1. Body-override (`seo` in POST body) — opt-in for this build only.
 *   2. Persisted `project_data.meta.seo` — saved from previous deploys.
 *
 * A verified/branded project URL wins. Until branded URLs are activated, the
 * existing project-specific body/persisted URL remains a backwards-compatible
 * fallback. A process-global SEO URL is never considered.
 *
 * Returns `null` when the resolved opt-in is OFF, so the caller can
 * short-circuit without invoking the apply-step. This keeps deploy
 * files byte-identical to today when the user hasn't opted in.
 *
 * Body explicit-noop: `siteUrl: null` (with or without `optIn`) is
 * always honored as opt-out for this single deploy, regardless of
 * persisted preferences. The Zod schema (`seoPreferencesSchema`)
 * distinguishes `null` (explicit) from `undefined` (omitted), and so
 * does this resolver — `??` is NOT used on `siteUrl` because that
 * collapses both into the persisted fallback. Mirrors
 * `applySeoToProjectFiles({ siteUrl: null })` semantics.
 */

import type { SeoOptions } from "@/lib/gen/scaffolds/seo-defaults";
import type {
  SeoPreferences,
  SeoPreferencesPersisted,
} from "@/lib/projects/preferences-schema";

export function resolveDeploySeoOptions(
  bodySeo: SeoPreferences | undefined,
  persisted: SeoPreferencesPersisted,
  projectLiveUrl: string | null,
): SeoOptions | null {
  // Preserve the existing one-deploy explicit opt-out contract. `null` is
  // intentionally different from omitted: it must not fall through to a
  // persisted fallback URL or a project canonical URL.
  if (bodySeo?.optIn === false || bodySeo?.siteUrl === null) return null;
  const optedIn = bodySeo?.optIn ?? persisted.optIn;
  const fallbackUrl =
    typeof bodySeo?.siteUrl === "string" && bodySeo.siteUrl
      ? bodySeo.siteUrl
      : persisted.siteUrl;
  const siteUrl = projectLiveUrl ?? fallbackUrl;
  if (!optedIn || !siteUrl) return null;
  const brand =
    bodySeo?.brand !== undefined
      ? (bodySeo.brand ?? undefined)
      : (persisted.brand ?? undefined);
  return { siteUrl, brand };
}
