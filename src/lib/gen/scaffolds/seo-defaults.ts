import type { ScaffoldFile, ScaffoldManifest } from "./types";
import { warnLog } from "@/lib/utils/debug";

/**
 * Scaffold SEO defaults — opt-in policy.
 *
 * Historical context (B3 + SAJ-39 + SAJ-43): this module used to *always*
 * inject `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx` and
 * enrich `app/layout.tsx` with `metadataBase` etc. The default URL was
 * hardcoded `https://example.com`, which leaked into generated sites
 * whenever the LLM forgot to rewrite it. SEO-defaults also belong to the
 * production lifecycle (fidelity3), not to the design lifecycle (fidelity1/2)
 * where users iterate on look & feel.
 *
 * New policy (idiot-safe by default):
 *   - If `SAJTMASKIN_SCAFFOLD_SEO_SITE_URL` is **unset**, the function is a
 *     **noop** — no SEO files injected, no metadata enrichment. The scaffold
 *     is returned unchanged. This eliminates the `example.com` leak vector
 *     entirely on dev / fidelity1-2 / preview environments.
 *   - If the env var is **set** (typical for fidelity3 / production export),
 *     the SEO files and metadata enrichment are injected with the real
 *     URL.
 *
 * Operators see a single warn at boot if the env var is missing, so the
 * gap is visible. Backoffice → "Scaffold Performance" page surfaces the
 * same warning for ops visibility.
 *
 * NOTE: the policy distinction is enforced *here*, not by callers. The
 * scaffold registry calls `applyScaffoldSeoDefaults` unconditionally
 * (see `registry.ts`); this module decides whether to actually inject.
 * That keeps the integration point trivial and idempotent.
 */

const SEO_SITE_URL_ENV = "SAJTMASKIN_SCAFFOLD_SEO_SITE_URL";

let warnedAboutMissingSeoSiteUrl = false;

function readSeoSiteUrl(): string | null {
  const fromEnv = process.env[SEO_SITE_URL_ENV]?.trim();
  if (!fromEnv) return null;
  return fromEnv.replace(/\/$/, "");
}

function warnOnceAboutMissingSeoSiteUrl(): void {
  if (warnedAboutMissingSeoSiteUrl) return;
  warnedAboutMissingSeoSiteUrl = true;
  warnLog("scaffold", "seo_defaults_disabled", {
    reason: `${SEO_SITE_URL_ENV} unset — scaffold SEO files (robots/sitemap/opengraph) and layout metadata enrichment are disabled. Set the env var (e.g. when promoting to fidelity3) to activate.`,
  });
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

function enrichLayoutMetadata(layoutContent: string, siteUrl: string): string {
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

  const titleExpr = extractMetadataExpression(metadataBody, "title", `"Website"`);
  const descriptionExpr = extractMetadataExpression(
    metadataBody,
    "description",
    `"Generated website with Next.js"`,
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
    locale: "sv_SE",
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
 * Apply scaffold SEO defaults — opt-in via `SAJTMASKIN_SCAFFOLD_SEO_SITE_URL`.
 *
 * - Without env var → returns the scaffold UNCHANGED (no SEO files injected,
 *   no layout metadata enrichment). The default-safe path: no `example.com`
 *   placeholder can leak because nothing is injected.
 * - With env var set → injects `app/robots.ts`, `app/sitemap.ts`,
 *   `app/opengraph-image.tsx` (idempotently — only if the scaffold doesn't
 *   already define them) and enriches `app/layout.tsx` (or `src/app/layout.tsx`)
 *   with `metadataBase` / `alternates` / `openGraph` / `twitter`.
 *
 * Recommended fidelity3 wiring: set the env var in the production / preview
 * deploy where the real domain is known. For dev / fidelity1-2 the env var
 * stays unset and SEO defaults are silent — `Scaffold Performance` page in
 * backoffice surfaces the disabled state.
 */
export function applyScaffoldSeoDefaults(scaffold: ScaffoldManifest): ScaffoldManifest {
  const siteUrl = readSeoSiteUrl();
  if (!siteUrl) {
    warnOnceAboutMissingSeoSiteUrl();
    return scaffold;
  }

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
      content: enrichLayoutMetadata(file.content, siteUrl),
    };
  });

  return {
    ...scaffold,
    files,
  };
}

/**
 * Test/backoffice helper — exposes whether SEO defaults are currently active
 * without leaking the env var directly. Used by the `Scaffold Performance`
 * panel to surface the disabled state.
 */
export function getScaffoldSeoDefaultsStatus(): {
  enabled: boolean;
  siteUrl: string | null;
} {
  const siteUrl = readSeoSiteUrl();
  return { enabled: siteUrl !== null, siteUrl };
}
