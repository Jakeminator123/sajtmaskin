import type { ScaffoldFile, ScaffoldManifest } from "./types";
import { warnLog } from "@/lib/utils/debug";
import type { SeoBrand } from "@/lib/projects/preferences-schema";

/**
 * Scaffold SEO defaults — opt-in policy with optional per-project override.
 *
 * Historical context (B3 + SAJ-39 + SAJ-43): this module used to *always*
 * inject `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx` and
 * enrich `app/layout.tsx` with `metadataBase` etc. The default URL was
 * hardcoded `https://example.com`, which leaked into generated sites
 * whenever the LLM forgot to rewrite it. SEO-defaults also belong to the
 * production lifecycle (fidelity3), not to the design lifecycle (fidelity1/2)
 * where users iterate on look & feel.
 *
 * Policy (idiot-safe by default):
 *   - **No options + env unset** → noop. Nothing injected, nothing
 *     enriched. The default-safe path; no `example.com` placeholder can
 *     leak because nothing is injected.
 *   - **No options + env set** → inject SEO files + enrich layout
 *     metadata with the env-derived siteUrl. Single-tenant fallback used
 *     when one Vercel-deploy serves one production domain.
 *   - **`options.siteUrl` (string)** → override env. Caller picked the
 *     domain for this generation.
 *   - **`options.siteUrl: null`** → explicit noop. Caller wants SEO off
 *     for this generation even if env is set.
 *   - **`options.brand`** → overrides title/description/locale fallbacks
 *     in `enrichLayoutMetadata` when the scaffold's `app/layout.tsx`
 *     doesn't already define those fields. Existing scaffold-content
 *     wins; brand only fills gaps. (Locale is the exception: brand wins
 *     because the scaffold's metadata has no locale today — the previous
 *     hardcoded `"sv_SE"` is replaced by `brand.locale` if provided.)
 *
 * Operators see a single warn at boot if the env-fallback path is hit
 * with no env set, so the gap is visible. Backoffice → "Scaffold
 * Performance" page surfaces the disabled state.
 *
 * Pipeline-koppling (calling with options) is PR-B scope. PR-A only
 * adds the helper signature + tests; `registry.ts` still calls
 * `applyScaffoldSeoDefaults(scaffold)` (no options) so behaviour is
 * unchanged for existing generations.
 */

const SEO_SITE_URL_ENV = "SAJTMASKIN_SCAFFOLD_SEO_SITE_URL";

/**
 * Cross-module-instance warn-once flag. Lives on `globalThis` so Next dev
 * HMR + edge/node runtime split (which both re-import this module) doesn't
 * reset the flag and spam the console with the same warning per scaffold
 * (registry.ts maps over 9 scaffolds, each calling this function).
 *
 * Reset semantics: only on full process restart, which is correct — we
 * want exactly one warn per process lifetime.
 */
const WARN_FLAG_KEY = "__sajtmaskinSeoDefaultsWarned" as const;
type WarnFlagHolder = { [WARN_FLAG_KEY]?: boolean };

function readSeoSiteUrl(): string | null {
  const fromEnv = process.env[SEO_SITE_URL_ENV]?.trim();
  if (!fromEnv) return null;
  return fromEnv.replace(/\/$/, "");
}

function warnOnceAboutMissingSeoSiteUrl(): void {
  const holder = globalThis as unknown as WarnFlagHolder;
  if (holder[WARN_FLAG_KEY]) return;
  holder[WARN_FLAG_KEY] = true;
  warnLog("scaffold", "seo_defaults_disabled", {
    reason: `${SEO_SITE_URL_ENV} unset — scaffold SEO files (robots/sitemap/opengraph) and layout metadata enrichment are disabled. Set the env var (e.g. when promoting to fidelity3) to activate.`,
  });
}

/**
 * Options for `applyScaffoldSeoDefaults` and `getScaffoldSeoDefaultsStatus`.
 *
 * - `siteUrl: string` → override env-derived siteUrl for this call.
 * - `siteUrl: null` → explicit noop (don't inject SEO even if env is set).
 * - `siteUrl: undefined` (or omitted) → fall back to env (existing behavior).
 * - `brand` → optional overrides for layout metadata fallbacks.
 */
export type SeoOptions = {
  siteUrl?: string | null;
  brand?: SeoBrand | null;
};

type ResolvedSeoSiteUrl =
  | { siteUrl: string; source: "override" | "env" }
  | { siteUrl: null; source: "explicit-noop" | "env-missing" };

function resolveSeoSiteUrl(options?: SeoOptions): ResolvedSeoSiteUrl {
  if (options) {
    if (options.siteUrl === null) {
      return { siteUrl: null, source: "explicit-noop" };
    }
    if (typeof options.siteUrl === "string" && options.siteUrl.trim().length > 0) {
      return {
        siteUrl: options.siteUrl.trim().replace(/\/$/, ""),
        source: "override",
      };
    }
  }
  const fromEnv = readSeoSiteUrl();
  if (fromEnv) return { siteUrl: fromEnv, source: "env" };
  return { siteUrl: null, source: "env-missing" };
}

function buildRobotsFile(siteUrl: string): ScaffoldFile {
  return {
    path: "app/robots.ts",
    content: `import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "${siteUrl}/sitemap.xml",
  };
}
`,
  };
}

function buildSitemapFile(siteUrl: string): ScaffoldFile {
  return {
    path: "app/sitemap.ts",
    content: `import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "${siteUrl}/",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
`,
  };
}

function buildOpenGraphImageFile(): ScaffoldFile {
  return {
    path: "app/opengraph-image.tsx",
    content: `import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #111827 0%, #1e293b 100%)",
          color: "#f8fafc",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 56,
          fontWeight: 700,
          letterSpacing: -1.2,
        }}
      >
        Website Preview
      </div>
    ),
    {
      width: size.width,
      height: size.height,
    },
  );
}
`,
  };
}

function ensureSeoScaffoldFile(files: ScaffoldFile[], file: ScaffoldFile): ScaffoldFile[] {
  if (files.some((entry) => entry.path === file.path)) {
    return files;
  }
  return [...files, file];
}

function findMetadataObjectRange(layoutContent: string): { start: number; end: number } | null {
  const marker = "export const metadata: Metadata = {";
  const markerIndex = layoutContent.indexOf(marker);
  if (markerIndex < 0) return null;

  const start = layoutContent.indexOf("{", markerIndex);
  if (start < 0) return null;

  let depth = 0;
  for (let index = start; index < layoutContent.length; index += 1) {
    const char = layoutContent[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return { start, end: index };
      }
    }
  }

  return null;
}

function extractMetadataExpression(
  metadataBody: string,
  key: "title" | "description",
  fallback: string,
): string {
  // SAJ-39: only single-line, single-token values are safe to splice into
  // the enriched metadata block. Multi-line template literals, object
  // expressions, and trailing-comment patterns get the fallback so we
  // never produce broken JS by capturing only the first line.
  const pattern = new RegExp(`${key}:\\s*([^\\n,]+)`);
  const match = metadataBody.match(pattern);
  const rawValue = match?.[1]?.trim() ?? "";
  if (!rawValue) return fallback;

  const startsWithBacktick = rawValue.startsWith("`");
  const endsWithBacktick = rawValue.endsWith("`");
  if (startsWithBacktick !== endsWithBacktick) return fallback;

  const startsWithBrace = rawValue.startsWith("{");
  const endsWithBrace = rawValue.endsWith("}");
  if (startsWithBrace !== endsWithBrace) return fallback;

  return rawValue;
}

function jsonStringSafe(value: string): string {
  return JSON.stringify(value);
}

function enrichLayoutMetadata(
  layoutContent: string,
  siteUrl: string,
  brand?: SeoBrand,
): string {
  const range = findMetadataObjectRange(layoutContent);
  if (!range) return layoutContent;

  const metadataBody = layoutContent.slice(range.start + 1, range.end);
  if (
    metadataBody.includes("metadataBase:") &&
    metadataBody.includes("alternates:") &&
    metadataBody.includes("openGraph:") &&
    metadataBody.includes("twitter:")
  ) {
    return layoutContent;
  }

  // Brand-data fills the title/description fallbacks (scaffold-content
  // wins via `extractMetadataExpression` if it already declares either).
  // Locale is the exception: brand wins because the scaffold metadata
  // has no locale field today, so `brand.locale` replaces the previous
  // hardcoded "sv_SE".
  const titleFallback = brand?.companyName
    ? jsonStringSafe(brand.companyName)
    : `"Website"`;
  const descriptionSource = brand?.tagline ?? brand?.description;
  const descriptionFallback = descriptionSource
    ? jsonStringSafe(descriptionSource)
    : `"Generated website with Next.js"`;
  const locale = brand?.locale ?? "sv_SE";

  const titleExpr = extractMetadataExpression(metadataBody, "title", titleFallback);
  const descriptionExpr = extractMetadataExpression(
    metadataBody,
    "description",
    descriptionFallback,
  );
  const enrichedMetadata = `{
  title: ${titleExpr},
  description: ${descriptionExpr},
  metadataBase: new URL("${siteUrl}"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: ${titleExpr},
    description: ${descriptionExpr},
    url: "/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Website preview image",
      },
    ],
    locale: "${locale}",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: ${titleExpr},
    description: ${descriptionExpr},
    images: ["/opengraph-image"],
  },
}`;

  return `${layoutContent.slice(0, range.start)}${enrichedMetadata}${layoutContent.slice(range.end + 1)}`;
}

/**
 * Apply scaffold SEO defaults.
 *
 * See module JSDoc above for the full opt-in policy. In short:
 *
 * - `applyScaffoldSeoDefaults(scaffold)` (no options) → env-fallback,
 *   identical to pre-PR-A behaviour. Used by `registry.ts`.
 * - `applyScaffoldSeoDefaults(scaffold, { siteUrl })` → override env.
 * - `applyScaffoldSeoDefaults(scaffold, { siteUrl: null })` → explicit
 *   noop even if env is set.
 * - `applyScaffoldSeoDefaults(scaffold, { brand })` → fills layout
 *   metadata fallbacks with brand fields (scaffold-content still wins
 *   for title/description; brand wins for locale).
 *
 * Pipeline-koppling that calls with project-specific options is PR-B
 * scope; PR-A only adds the option-aware signature + tests.
 */
export function applyScaffoldSeoDefaults(
  scaffold: ScaffoldManifest,
  options?: SeoOptions,
): ScaffoldManifest {
  const resolved = resolveSeoSiteUrl(options);
  if (resolved.siteUrl === null) {
    if (resolved.source === "env-missing") {
      // Only warn in env-fallback path. Caller-driven explicit-noop is a
      // deliberate choice and shouldn't trigger an operator warning.
      warnOnceAboutMissingSeoSiteUrl();
    }
    return scaffold;
  }
  const { siteUrl } = resolved;
  const brand = options?.brand ?? undefined;

  let files = [...scaffold.files];
  files = ensureSeoScaffoldFile(files, buildRobotsFile(siteUrl));
  files = ensureSeoScaffoldFile(files, buildSitemapFile(siteUrl));
  files = ensureSeoScaffoldFile(files, buildOpenGraphImageFile());

  // Dual-support intentional: scaffolds always use `app/layout.tsx`, but this
  // function also runs on merged scaffold + LLM-emitted output where the
  // user's project may be `src/app/`-rooted. Do NOT collapse to a single
  // path — see JSDoc on `validateScaffoldManifest` for the policy.
  files = files.map((file) => {
    if (file.path !== "app/layout.tsx" && file.path !== "src/app/layout.tsx") {
      return file;
    }
    return {
      ...file,
      content: enrichLayoutMetadata(file.content, siteUrl, brand),
    };
  });

  return {
    ...scaffold,
    files,
  };
}

/**
 * Test/backoffice helper — exposes whether SEO defaults would be active
 * for a given options shape (or for the env-fallback path when no options
 * are provided). Used by the `Scaffold Performance` panel to surface the
 * disabled state, and by tests/UI to preview whether opt-in would inject
 * SEO without actually running it.
 */
export function getScaffoldSeoDefaultsStatus(options?: SeoOptions): {
  enabled: boolean;
  siteUrl: string | null;
  source: ResolvedSeoSiteUrl["source"];
} {
  const resolved = resolveSeoSiteUrl(options);
  return {
    enabled: resolved.siteUrl !== null,
    siteUrl: resolved.siteUrl,
    source: resolved.source,
  };
}
