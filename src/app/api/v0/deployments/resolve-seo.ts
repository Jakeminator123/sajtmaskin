/**
 * Pure precedence helper for the deploy route's SEO resolution.
 *
 * Extracted from `route.ts` so it can be unit-tested without paying the
 * cost of importing the entire deploy handler (db-client, gateway,
 * vercel-sdk, etc.). The route re-exports this function to keep the
 * existing public surface unchanged.
 *
 * Precedence:
 *   1. Body-override (`seo` in POST body) — opt-in for this build only.
 *   2. Persisted `project_data.meta.seo` — saved from previous deploys.
 *   3. No options → core helper (`applySeoToProjectFiles` / scaffold-
 *      wrapper) falls back to env (`SAJTMASKIN_SCAFFOLD_SEO_SITE_URL`).
 *
 * Returns `null` when the resolved opt-in is OFF, so the caller can
 * short-circuit without invoking the apply-step. This keeps deploy
 * files byte-identical to today when the user hasn't opted in.
 */

import type { SeoOptions } from "@/lib/gen/scaffolds/seo-defaults";
import type {
  SeoPreferences,
  SeoPreferencesPersisted,
} from "@/lib/projects/preferences-schema";

export function resolveDeploySeoOptions(
  bodySeo: SeoPreferences | undefined,
  persisted: SeoPreferencesPersisted,
): SeoOptions | null {
  if (bodySeo !== undefined) {
    if (bodySeo.optIn === false) {
      return null;
    }
    if (bodySeo.optIn === true && bodySeo.siteUrl) {
      return {
        siteUrl: bodySeo.siteUrl,
        brand: bodySeo.brand ?? undefined,
      };
    }
    if (persisted.optIn && (bodySeo.siteUrl ?? persisted.siteUrl)) {
      const siteUrl = bodySeo.siteUrl ?? persisted.siteUrl;
      if (!siteUrl) return null;
      const brand =
        bodySeo.brand !== undefined
          ? (bodySeo.brand ?? undefined)
          : (persisted.brand ?? undefined);
      return { siteUrl, brand };
    }
    return null;
  }
  if (persisted.optIn && persisted.siteUrl) {
    return {
      siteUrl: persisted.siteUrl,
      brand: persisted.brand ?? undefined,
    };
  }
  return null;
}
