import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import { runDepCompleter } from "../autofix/dep-completer";
import type { CodeFile } from "../parser";
import { loadPlaceholderRecord, formatDotenvBody } from "@/lib/gen/preview/env-local";

/**
 * Download/export scaffold.
 *
 * This is separate from the small runtime scaffolds under `gen/scaffolds/`:
 * - runtime scaffolds shape the model prompt before generation
 * - this file fills in missing project boilerplate when exporting/downloading
 *
 * `_template_refs/` is a third, separate concept: research material only.
 */
/**
 * Node-engine-range för **exporterade/nedladdade** projekt.
 *
 * Vi tillåter Node 22, 23 och 24. Bredare än preview-host och repots egna
 * package.json (som låser till 22 eftersom Fly-imagen och Vercel-runtime kör
 * Node 22), men exporterade projekt landar på användarens egen maskin där
 * Node 24 redan är vanligt. Strikt `<23` triggade kosmetisk EBADENGINE-warn
 * vid `npm install` utan att paketen faktiskt var inkompatibla.
 */
const GENERATED_PROJECT_NODE_RANGE = ">=22.14.0 <25";

const PACKAGE_JSON = `{
  "name": "sajtmaskin-project",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": "${GENERATED_PROJECT_NODE_RANGE}"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "next": "16.2.3",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "radix-ui": "1.4.3",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "tailwind-merge": "3.3.0",
    "lucide-react": "0.469.0",
    "next-themes": "0.4.6",
    "sonner": "2.0.7",
    "recharts": "2.15.4",
    "cmdk": "1.1.1",
    "vaul": "1.1.2",
    "input-otp": "1.4.2",
    "embla-carousel-react": "8.6.0",
    "react-day-picker": "9.14.0",
    "react-resizable-panels": "4.7.2",
    "react-hook-form": "7.71.2",
    "@hookform/resolvers": "5.2.2",
    "zod": "4.3.6",
    "framer-motion": "12.38.0",
    "@tanstack/react-table": "8.21.3",
    "three": "0.176.0",
    "@react-three/fiber": "9.1.2",
    "@react-three/drei": "10.7.7",
    "@react-three/rapier": "2.2.0",
    "date-fns": "4.1.0"
  },
  "devDependencies": {
    "eslint": "9.39.2",
    "eslint-config-next": "16.2.3",
    "typescript": "5.8.3",
    "@types/node": "22.15.18",
    "@types/react": "19.1.2",
    "@types/react-dom": "19.1.2",
    "@tailwindcss/postcss": "4.1.5",
    "tailwindcss": "4.1.5"
  }
}`;

/** Parsed once — baseline for merge when the model emits a partial `package.json`. */
const BASELINE_PACKAGE_JSON = JSON.parse(PACKAGE_JSON) as Record<string, unknown>;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}`;
const BASELINE_TSCONFIG = JSON.parse(TSCONFIG) as Record<string, unknown>;

const NEXT_CONFIG = `import type { NextConfig } from "next";

/** Tier 2 preview-host (Fly): public URL is /{chatId}/* — the path key is the own-engine chat id, not the app project id. */
const previewBasePath = process.env.SAJTMASKIN_PREVIEW_BASE_PATH?.trim() || "";

const nextConfig: NextConfig = {
  ...(previewBasePath ? { basePath: previewBasePath } : {}),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "*.blob.vercel-storage.com" },
      { protocol: "https", hostname: "api.dicebear.com" },
    ],
  },
  async rewrites() {
    return [{ source: "/placeholder.svg", destination: "/api/placeholder" }];
  },
};

export default nextConfig;
`;

export const PLACEHOLDER_API_ROUTE = `import { NextRequest } from "next/server";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const width = Math.min(
    Math.max(parseInt(params.get("width") || params.get("w") || "600", 10) || 600, 1),
    2000,
  );
  const height = Math.min(
    Math.max(parseInt(params.get("height") || params.get("h") || "400", 10) || 400, 1),
    2000,
  );
  const text = params.get("text") || \`\${width} × \${height}\`;
  const fontSize = Math.max(12, Math.min(24, width / 20));
  const subFontSize = Math.max(10, Math.min(14, width / 30));

  const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="\${width}" height="\${height}" viewBox="0 0 \${width} \${height}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e293b"/>
      <stop offset="100%" style="stop-color:#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="1" y="1" width="\${width - 2}" height="\${height - 2}" fill="none" stroke="#334155" stroke-width="1" rx="4"/>
  <text x="50%" y="48%" text-anchor="middle" dominant-baseline="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="\${fontSize}">
    \${escapeXml(text)}
  </text>
  <text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle" fill="#475569" font-family="system-ui,sans-serif" font-size="\${subFontSize}">
    Placeholder
  </text>
</svg>\`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
`;

const POSTCSS_CONFIG = `const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
`;

const ESLINT_CONFIG = `import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
  ]),
]);
`;

const GLOBALS_CSS = `@import "tailwindcss";

@theme inline {
  --color-background: hsl(222 47% 11%);
  --color-foreground: hsl(210 40% 98%);
  --color-card: hsl(222 47% 14%);
  --color-card-foreground: hsl(210 40% 98%);
  --color-popover: hsl(222 47% 14%);
  --color-popover-foreground: hsl(210 40% 98%);
  --color-primary: hsl(217 91% 60%);
  --color-primary-foreground: hsl(0 0% 100%);
  --color-secondary: hsl(215 28% 17%);
  --color-secondary-foreground: hsl(210 40% 98%);
  --color-muted: hsl(217 33% 17%);
  --color-muted-foreground: hsl(215 20% 70%);
  --color-accent: hsl(159 64% 46%);
  --color-accent-foreground: hsl(222 47% 11%);
  --color-destructive: hsl(0 72% 51%);
  --color-destructive-foreground: hsl(0 0% 100%);
  --color-border: hsl(217 22% 26%);
  --color-input: hsl(217 22% 26%);
  --color-ring: hsl(217 91% 60%);
  --radius: 0.625rem;
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`;

const LAYOUT_TSX = `import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Sajtmaskin Project",
  description: "Generated by Sajtmaskin",
  openGraph: {
    title: "Sajtmaskin Project",
    description: "Generated by Sajtmaskin",
    url: siteUrl,
    siteName: "Sajtmaskin Project",
    locale: "sv_SE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sajtmaskin Project",
    description: "Generated by Sajtmaskin",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="sv" className="dark" suppressHydrationWarning>
      <body className={\`\${inter.variable} antialiased\`}>
        {children}
      </body>
    </html>
  );
}
`;

const ROBOTS_TS = `import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: \`\${siteUrl}/sitemap.xml\`,
  };
}
`;

const SITEMAP_TS = `import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
    },
  ];
}
`;

const LIB_UTILS = `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

/** Present from first unpack so \`tsc\` / editors agree with Next before first \`next dev\`. */
const NEXT_ENV_D_TS = `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// This file is maintained by Next.js — do not edit manually.
`;

const SCAFFOLD_FILES: Record<string, string> = {
  "package.json": PACKAGE_JSON,
  "next-env.d.ts": NEXT_ENV_D_TS,
  "tsconfig.json": TSCONFIG,
  "next.config.ts": NEXT_CONFIG,
  "app/api/placeholder/route.ts": PLACEHOLDER_API_ROUTE,
  "postcss.config.mjs": POSTCSS_CONFIG,
  "eslint.config.mjs": ESLINT_CONFIG,
  "app/globals.css": GLOBALS_CSS,
  "app/layout.tsx": LAYOUT_TSX,
  "app/robots.ts": ROBOTS_TS,
  "app/sitemap.ts": SITEMAP_TS,
  "lib/utils.ts": LIB_UTILS,
};

const GENERATED_ENV_LOCAL_HEADER = `# Sajtmaskin — placeholder .env.local for local development (not production secrets)
# Same keys as tier-2 preview runtime; override with real values when deploying.
`;

/**
 * Dependencies where the scaffold baseline must always win over the model.
 * The LLM sometimes pins older majors that conflict with peer requirements
 * (e.g. fiber 8 + React 19, or React 18 + Next 16).  Keep this list short
 * and only add packages whose version is load-bearing for the whole tree.
 */
const BASELINE_PINNED_DEPS = [
  "react",
  "react-dom",
  "next",
  "three",
  "@react-three/fiber",
  "@react-three/drei",
] as const;

/**
 * Model `package.json` is merged **onto** the Sajtmaskin baseline so scripts, devDependencies,
 * and core tooling survive thin LLM output (zip export / preview runtime use the same merge).
 */
export function mergePackageJsonWithBaseline(
  model: Record<string, unknown>,
  detected: { dependencies: Record<string, string> },
): Record<string, unknown> {
  const b = BASELINE_PACKAGE_JSON;
  const bScripts = (b.scripts as Record<string, string> | undefined) ?? {};
  const bDep = (b.dependencies as Record<string, string> | undefined) ?? {};
  const bDevDep = (b.devDependencies as Record<string, string> | undefined) ?? {};
  const mScripts = (model.scripts as Record<string, string> | undefined) ?? {};
  const mDep = (model.dependencies as Record<string, string> | undefined) ?? {};
  const mDevDep = (model.devDependencies as Record<string, string> | undefined) ?? {};

  const dependencies: Record<string, string> = {
    ...bDep,
    ...mDep,
    ...detected.dependencies,
  };
  for (const key of BASELINE_PINNED_DEPS) {
    if (bDep[key] !== undefined) {
      dependencies[key] = bDep[key];
    }
  }

  return {
    ...b,
    ...model,
    scripts: { ...bScripts, ...mScripts },
    dependencies,
    devDependencies: { ...bDevDep, ...mDevDep },
  };
}

const UNSAFE_TSCONFIG_COMPILER_KEYS = new Set([
  "noLib",
  "noResolve",
  "types",
  "typeRoots",
  "rootDir",
  "rootDirs",
  "outDir",
  "outFile",
  "declaration",
  "declarationDir",
  "composite",
]);

function stripUnsafeCompilerOptions(
  opts: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(opts).filter(([k]) => !UNSAFE_TSCONFIG_COMPILER_KEYS.has(k)),
  );
}

export function mergeTsconfigWithBaseline(
  model: Record<string, unknown>,
): Record<string, unknown> {
  const baseline = BASELINE_TSCONFIG;
  const baselineCompilerOptions =
    (baseline.compilerOptions as Record<string, unknown> | undefined) ?? {};
  const modelCompilerOptions = stripUnsafeCompilerOptions(
    (model.compilerOptions as Record<string, unknown> | undefined) ?? {},
  );

  const mergedLib = Array.from(
    new Set([
      ...(((baselineCompilerOptions.lib as unknown[]) ?? []).filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      )),
      ...(((modelCompilerOptions.lib as unknown[]) ?? []).filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      )),
    ]),
  );

  const mergedInclude = Array.from(
    new Set([
      ...((((baseline.include as unknown[]) ?? []).filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ))),
      ...((((model.include as unknown[]) ?? []).filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ))),
    ]),
  );

  const mergedExclude = Array.from(
    new Set([
      ...((((baseline.exclude as unknown[]) ?? []).filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ))),
      ...((((model.exclude as unknown[]) ?? []).filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ))),
    ]),
  );

  const mergedPlugins = Array.from(
    new Map(
      [
        ...((((baselineCompilerOptions.plugins as unknown[]) ?? []).filter(
          (value): value is Record<string, unknown> =>
            Boolean(value) && typeof value === "object" && !Array.isArray(value),
        ))),
        ...((((modelCompilerOptions.plugins as unknown[]) ?? []).filter(
          (value): value is Record<string, unknown> =>
            Boolean(value) && typeof value === "object" && !Array.isArray(value),
        ))),
      ].map((plugin) => [JSON.stringify(plugin), plugin]),
    ).values(),
  );

  return {
    ...baseline,
    ...model,
    compilerOptions: {
      ...baselineCompilerOptions,
      ...modelCompilerOptions,
      paths: {
        ...(((baselineCompilerOptions.paths as Record<string, unknown> | undefined) ?? {})),
        ...(((modelCompilerOptions.paths as Record<string, unknown> | undefined) ?? {})),
      },
      lib: mergedLib,
      plugins: mergedPlugins,
    },
    include: mergedInclude,
    exclude: mergedExclude,
  };
}

function buildPlaceholderEnvLocalBody(): string | null {
  try {
    const record = loadPlaceholderRecord();
    if (Object.keys(record).length === 0) return null;
    return `${GENERATED_ENV_LOCAL_HEADER}\n${formatDotenvBody(record)}\n`;
  } catch {
    return null;
  }
}

export function buildCompleteProject(
  generatedFiles: CodeFile[],
  uiComponents?: Array<{ filename: string; content: string }>,
): CodeFile[] {
  const result: CodeFile[] = [];
  const generatedPaths = new Set(generatedFiles.map((f) => f.path));

  const allCode = [
    ...generatedFiles.map((f) => f.content),
    ...(uiComponents ?? []).map((component) => component.content),
  ].join("\n");
  const detected = runDepCompleter(allCode);

  const mergeModelPackageJson = (file: CodeFile): CodeFile => {
    if (file.path !== "package.json") return file;
    try {
      const model = JSON.parse(file.content) as Record<string, unknown>;
      const merged = mergePackageJsonWithBaseline(model, detected);
      return { ...file, content: JSON.stringify(merged, null, 2) };
    } catch {
      const merged = mergePackageJsonWithBaseline({}, detected);
      return { ...file, content: JSON.stringify(merged, null, 2) };
    }
  };

  const mergeModelTsconfig = (file: CodeFile): CodeFile => {
    if (file.path !== "tsconfig.json") return file;
    try {
      const model = JSON.parse(file.content) as Record<string, unknown>;
      const merged = mergeTsconfigWithBaseline(model);
      return { ...file, content: JSON.stringify(merged, null, 2) };
    } catch {
      const merged = mergeTsconfigWithBaseline({});
      return { ...file, content: JSON.stringify(merged, null, 2) };
    }
  };

  for (const [filePath, content] of Object.entries(SCAFFOLD_FILES)) {
    if (filePath === "package.json" && !generatedPaths.has(filePath)) {
      const merged = mergePackageJsonWithBaseline({}, detected);
      result.push({ path: filePath, content: JSON.stringify(merged, null, 2), language: "json" });
      continue;
    }
    if (!generatedPaths.has(filePath)) {
      result.push({ path: filePath, content, language: inferFileLanguage(filePath) });
    }
  }

  for (const comp of uiComponents ?? []) {
    const destPath = `components/ui/${comp.filename}`;
    if (!generatedPaths.has(destPath)) {
      result.push({ path: destPath, content: comp.content, language: "tsx" });
    }
  }

  result.push(...generatedFiles.map((file) => mergeModelTsconfig(mergeModelPackageJson(file))));

  if (!result.some((f) => f.path === ".env.local")) {
    const envBody = buildPlaceholderEnvLocalBody();
    if (envBody) {
      result.push({ path: ".env.local", content: envBody, language: "text" });
    }
  }

  return result.sort((a, b) => a.path.localeCompare(b.path));
}


