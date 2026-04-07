import type { ScaffoldFile, ScaffoldManifest } from "./types";

const SEO_DEFAULT_SITE_URL = "https://example.com";

const ROBOTS_FILE: ScaffoldFile = {
  path: "app/robots.ts",
  content: `import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "${SEO_DEFAULT_SITE_URL}/sitemap.xml",
  };
}
`,
};

const SITEMAP_FILE: ScaffoldFile = {
  path: "app/sitemap.ts",
  content: `import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "${SEO_DEFAULT_SITE_URL}/",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
`,
};

const OPENGRAPH_IMAGE_FILE: ScaffoldFile = {
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
  const pattern = new RegExp(`${key}:\\s*([^\\n,]+)`);
  const match = metadataBody.match(pattern);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function enrichLayoutMetadata(layoutContent: string): string {
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
  metadataBase: new URL("${SEO_DEFAULT_SITE_URL}"),
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

export function applyScaffoldSeoDefaults(scaffold: ScaffoldManifest): ScaffoldManifest {
  let files = [...scaffold.files];
  files = ensureSeoScaffoldFile(files, ROBOTS_FILE);
  files = ensureSeoScaffoldFile(files, SITEMAP_FILE);
  files = ensureSeoScaffoldFile(files, OPENGRAPH_IMAGE_FILE);

  files = files.map((file) => {
    if (file.path !== "app/layout.tsx" && file.path !== "src/app/layout.tsx") {
      return file;
    }
    return {
      ...file,
      content: enrichLayoutMetadata(file.content),
    };
  });

  return {
    ...scaffold,
    files,
  };
}
