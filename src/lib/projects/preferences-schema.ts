/**
 * Project preferences schema.
 *
 * Owns the zod schema for `project_data.meta`-persisted preferences. The
 * schema is shared between:
 *
 * - `src/app/api/projects/[id]/preferences/route.ts` (GET/PATCH validation)
 * - future Bygg-dialog UI (PR-B in `docs/plans/active/SEO-F3-PROMOTION-NEXT-PR.md`)
 *
 * Keeping the schema here (not next to the route) lets the future UI pull
 * the same Zod types without depending on `src/app/`-internals.
 *
 * Scope: PR-A only. Currently covers `allowPlaceholdersInF3` (existing) and
 * `seo` (new). Add new keys here as they get persisted under
 * `project_data.meta`.
 */
import { z } from "zod";

/**
 * IETF-ish locale tag accepted in `seo.brand.locale`.
 *
 * Permits `xx`, `xx_XX`, and `xx-XX` variants because Next.js Metadata API
 * + Open Graph both accept underscore and hyphen forms. Keeps validation
 * tight enough to catch obvious typos while not forcing an opinion on
 * hyphen vs underscore.
 */
const localeSchema = z
  .string()
  .regex(
    /^[a-z]{2}(?:[-_][A-Z]{2})?$/,
    "Locale must be IETF-formatted (e.g. 'sv', 'sv_SE', 'en-US')",
  );

/**
 * Brand-data persisted under `project_data.meta.seo.brand`. Used by
 * `applyScaffoldSeoDefaults({ brand })` to override the generic title /
 * description / locale fallbacks injected into `app/layout.tsx` metadata.
 */
export const seoBrandSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  tagline: z.string().min(1).max(500).optional(),
  description: z.string().min(1).max(2000).optional(),
  locale: localeSchema.optional(),
});

export type SeoBrand = z.infer<typeof seoBrandSchema>;

/**
 * SEO preferences persisted under `project_data.meta.seo`.
 *
 * - `optIn=true` requires `siteUrl` to be a non-null string. Enforced by
 *   `superRefine` so callers get one parse-time error instead of
 *   needing a separate validation step.
 * - `siteUrl` must be `https://`. HTTP and other schemes are rejected
 *   because canonical URLs in robots/sitemap/openGraph must be HTTPS for
 *   modern crawlers.
 * - `brand` is optional even when opt-in (sensible defaults are used in
 *   `applyScaffoldSeoDefaults` when brand fields are missing).
 * - All fields are optional at the schema level so PATCH can update a
 *   subset without resending the whole object.
 */
export const seoPreferencesSchema = z
  .object({
    optIn: z.boolean().optional(),
    siteUrl: z
      .string()
      .url({ message: "siteUrl must be a valid URL" })
      .refine((url) => url.startsWith("https://"), {
        message: "siteUrl must use https://",
      })
      .nullable()
      .optional(),
    brand: seoBrandSchema.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.optIn === true && (data.siteUrl === null || data.siteUrl === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "siteUrl is required when SEO opt-in is enabled",
        path: ["siteUrl"],
      });
    }
  });

export type SeoPreferences = z.infer<typeof seoPreferencesSchema>;

/**
 * Top-level shape accepted by `PATCH /api/projects/[id]/preferences`.
 * All fields optional so partial updates are allowed.
 */
export const projectPreferencesPatchSchema = z.object({
  allowPlaceholdersInF3: z.boolean().optional(),
  seo: seoPreferencesSchema.optional(),
});

export type ProjectPreferencesPatch = z.infer<typeof projectPreferencesPatchSchema>;

/**
 * Default values returned by `GET /api/projects/[id]/preferences` when
 * the project has not yet persisted any preferences.
 */
export const SEO_PREFERENCES_DEFAULTS = {
  optIn: false,
  siteUrl: null,
  brand: null,
  lastSetAt: null,
} as const;

export type SeoPreferencesPersisted = {
  optIn: boolean;
  siteUrl: string | null;
  brand: SeoBrand | null;
  lastSetAt: string | null;
};

/**
 * Normalize a raw `project_data.meta.seo`-shaped object (which can be
 * anything jsonb returns) into the typed `SeoPreferencesPersisted` shape
 * that callers can rely on.
 *
 * Defensive: returns defaults for any malformed sub-shape so downstream
 * code never has to second-guess the persisted blob.
 */
export function readSeoPreferencesFromMeta(
  meta: Record<string, unknown> | null | undefined,
): SeoPreferencesPersisted {
  if (!meta || typeof meta !== "object") return { ...SEO_PREFERENCES_DEFAULTS };
  const raw = (meta as Record<string, unknown>).seo;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...SEO_PREFERENCES_DEFAULTS };
  }
  const seo = raw as Record<string, unknown>;
  const brandRaw = seo.brand;
  const brand =
    brandRaw && typeof brandRaw === "object" && !Array.isArray(brandRaw)
      ? (brandRaw as SeoBrand)
      : null;
  return {
    optIn: seo.optIn === true,
    siteUrl: typeof seo.siteUrl === "string" ? seo.siteUrl : null,
    brand,
    lastSetAt: typeof seo.lastSetAt === "string" ? seo.lastSetAt : null,
  };
}
