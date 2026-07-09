import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import { runDepCompleter, resolveKnownVersion } from "../autofix/dep-completer";
import type { CodeFile } from "../parser";
import {
  loadAllPlaceholderRecordForF2,
  formatDotenvBody,
  PIPELINE_ENV_LOCAL_MARKER,
} from "@/lib/gen/preview/env-local";
import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";

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
 * Matcha Vercel/preview-host-lanen: Node 22. Bredare ranges kan få Vercel
 * att välja/varna om runtime-versioner som Next/Vercel inte stödjer för
 * exporterade projekt.
 */
const GENERATED_PROJECT_NODE_RANGE = ">=22.14.0 <23";

const PACKAGE_JSON = `{
  "name": "sajtmaskin-project",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": "${GENERATED_PROJECT_NODE_RANGE}"
  },
  "scripts": {
    "dev": "next dev --webpack",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "next": "16.2.9",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "radix-ui": "1.4.3",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "tailwind-merge": "3.3.0",
    "lucide-react": "0.563.0",
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
    "date-fns": "4.1.0",
    "react-error-boundary": "6.1.2",
    "react-intersection-observer": "10.0.3",
    "canvas-confetti": "1.9.4",
    "@tanstack/react-virtual": "3.14.4"
  },
  "devDependencies": {
    "eslint": "9.39.2",
    "eslint-config-next": "16.2.9",
    "typescript": "5.9.3",
    "@types/node": "22.19.17",
    "@types/react": "19.2.13",
    "@types/react-dom": "19.2.3",
    "@types/canvas-confetti": "1.9.0",
    "@tailwindcss/postcss": "4.1.18",
    "tailwindcss": "4.1.18"
  },
  "overrides": {
    "postcss": "^8.5.10"
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
  const text = params.get("label") || params.get("text") || \`\${width} × \${height}\`;
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

/**
 * Canonical reduced-motion hook shipped with every exported project.
 *
 * Rationale: without this file, ad-hoc motion components often hand-roll
 * a `useState(false) + useEffect(() => setMounted(true), [])` guard — a
 * pattern that React 19 + eslint-plugin-react-hooks flags under
 * \`react-hooks/set-state-in-effect\`. Subscribing to \`matchMedia\` is the
 * explicitly-allowed shape (external store → setState is fine).
 *
 * Returns \`true\` on the server and on first render client-side to avoid
 * hydration mismatches; flips to the live \`matchMedia\` result on mount.
 */
const LIB_USE_REDUCED_MOTION = `"use client";

import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    setReduced(query.matches);
    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return reduced;
}
`;

/** Present from first unpack so \`tsc\` / editors agree with Next before first \`next dev\`. */
const NEXT_ENV_D_TS = `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// This file is maintained by Next.js — do not edit manually.
`;

/**
 * Standard Next.js project ignore list. Inert for typecheck/build/verify (git
 * never reads it during those), but it keeps `node_modules`, build output and
 * env files out of a user's repo after they `git init` an exported project.
 *
 * `.env*` matches every dotted env file (`.env`, `.env.local`, …) but NOT the
 * canonical `env.example` (no leading dot, `PROJECT_ENV_FILE_PATH`), so the env
 * template stays tracked. `!.env.example` re-includes the dotted variant if a
 * project ships one.
 */
const GITIGNORE = `node_modules
.next
out
build
dist
.env*
!.env.example
.vercel
*.log
.DS_Store
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
  "hooks/use-reduced-motion.ts": LIB_USE_REDUCED_MOTION,
  ".gitignore": GITIGNORE,
};

// First line MUST be `PIPELINE_ENV_LOCAL_MARKER` — the env.example builder
// uses it to tell this pipeline-authored placeholder dump apart from a
// genuinely model-emitted `.env.local` (see env-local.ts for the rationale).
const GENERATED_ENV_LOCAL_HEADER = `${PIPELINE_ENV_LOCAL_MARKER}
# Same keys as tier-2 preview runtime; override with real values when deploying.
`;

/**
 * Dependencies where the scaffold baseline must always win over the model.
 * The LLM sometimes pins older majors that conflict with peer requirements
 * (e.g. React 18 + Next 16). Keep this list short and only add packages whose
 * version is load-bearing for the whole tree.
 * Lucide is pinned because generated icon validation is tied to its exact
 * runtime export set.
 *
 * The React-Three 3D stack used to live here, but it is no longer part of the
 * always-installed baseline (it is capability-gated). `applyThreeStackPolicy`
 * below pins/prunes it on demand instead.
 */
const BASELINE_PINNED_DEPS = [
  "react",
  "react-dom",
  "next",
  "lucide-react",
] as const;

/**
 * Heavy, capability-gated React-Three 3D stack. `three` is the shared peer
 * dependency of fiber/drei/rapier, so the stack is treated as one group:
 *  - if any member is imported by the generated code (detected by the dep
 *    scan), keep the stack and pin every present member to the canonical
 *    platform version (KNOWN_PACKAGES), ensuring `three` ships even when only
 *    the React wrappers are imported (it is their peer dependency);
 *  - if nothing in the stack is imported, strip any members that leaked into
 *    the model `package.json` (capability false-positive bloat — e.g. a brief
 *    that tagged `visual-3d` on a prompt that never rendered a Canvas).
 */
const THREE_STACK = [
  "three",
  "@react-three/fiber",
  "@react-three/drei",
  "@react-three/rapier",
] as const;

function applyThreeStackPolicy(
  dependencies: Record<string, string>,
  detected: Record<string, string>,
): void {
  const used = THREE_STACK.some((pkg) => detected[pkg] !== undefined);
  if (!used) {
    for (const pkg of THREE_STACK) delete dependencies[pkg];
    return;
  }
  for (const pkg of THREE_STACK) {
    if (dependencies[pkg] === undefined && detected[pkg] === undefined) continue;
    dependencies[pkg] = resolveKnownVersion(pkg) ?? dependencies[pkg] ?? detected[pkg];
  }
  const threePin = resolveKnownVersion("three");
  if (threePin) dependencies.three = threePin;
}

/**
 * Model `package.json` is merged **onto** the Sajtmaskin baseline so scripts, devDependencies,
 * and core tooling survive thin LLM output (zip export / preview runtime use the same merge).
 *
 * `overrides` are merged with the baseline winning on conflicts. The postcss
 * override (`^8.5.10`) closes the GHSA-qx2v-qp2m-jg93 audit warning that
 * Next 16.x's transitive postcss otherwise triggers on user `npm audit`.
 */
export function mergePackageJsonWithBaseline(
  model: Record<string, unknown>,
  detected: { dependencies: Record<string, string> },
): Record<string, unknown> {
  const b = BASELINE_PACKAGE_JSON;
  const bScripts = (b.scripts as Record<string, string> | undefined) ?? {};
  const bDep = (b.dependencies as Record<string, string> | undefined) ?? {};
  const bDevDep = (b.devDependencies as Record<string, string> | undefined) ?? {};
  const bOverrides = (b.overrides as Record<string, string> | undefined) ?? {};
  const mScripts = (model.scripts as Record<string, string> | undefined) ?? {};
  const mDep = (model.dependencies as Record<string, string> | undefined) ?? {};
  const mDevDep = (model.devDependencies as Record<string, string> | undefined) ?? {};
  const mOverrides = (model.overrides as Record<string, string> | undefined) ?? {};

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

  applyThreeStackPolicy(dependencies, detected.dependencies);

  return {
    ...b,
    ...model,
    scripts: { ...bScripts, ...mScripts },
    dependencies,
    devDependencies: { ...bDevDep, ...mDevDep },
    overrides: { ...mOverrides, ...bOverrides },
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
    const record = loadAllPlaceholderRecordForF2();
    if (Object.keys(record).length === 0) return null;
    return `${GENERATED_ENV_LOCAL_HEADER}\n${formatDotenvBody(record)}\n`;
  } catch {
    return null;
  }
}

/**
 * Sibling source extensions that resolve to the same module under bundler
 * resolution. When a baseline-shipped helper exists at one extension, any
 * generated file with the same module stem at a different extension creates
 * an extension-collision that the bundler resolves non-deterministically.
 *
 * Real-world repro: scaffold ships `hooks/use-reduced-motion.ts`. An older
 * autofix path (or an LLM "fix" round) emits `hooks/use-reduced-motion.tsx`
 * with a markdown fence remnant on line 1. Webpack picks the `.tsx` and the
 * preview crashes with `ReferenceError: ts is not defined`. Drop the
 * generated sibling so the baseline always wins.
 */
const COLLIDING_SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"] as const;

function moduleStemForCollision(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  for (const ext of COLLIDING_SOURCE_EXTENSIONS) {
    if (normalized.endsWith(ext)) {
      return normalized.slice(0, -ext.length);
    }
  }
  return null;
}

/**
 * Build the set of module stems that the baseline scaffold owns (i.e. paths
 * in `SCAFFOLD_FILES` that have a source extension). Used to drop any
 * generated sibling at a different extension (`.ts` vs `.tsx`) so the
 * baseline file is the single canonical source after merge.
 */
function buildBaselineOwnedStems(): Map<string, string> {
  const stems = new Map<string, string>();
  for (const baselinePath of Object.keys(SCAFFOLD_FILES)) {
    const stem = moduleStemForCollision(baselinePath);
    if (stem) stems.set(stem, baselinePath);
  }
  return stems;
}

/**
 * Canonical shadcn component stems (kebab-case import subpaths such as
 * `carousel`, `alert-dialog`, `sonner`). Derived from the registry *values*
 * because keys are the PascalCase exported names while the file stem under
 * `components/ui/` is the import subpath. Lower-cased so matching is
 * case-insensitive against generated paths.
 */
const CANONICAL_SHADCN_UI_STEMS = new Set<string>(
  Object.values(SHADCN_COMPONENTS).map((subpath) => subpath.toLowerCase()),
);

/** `components/ui/<stem>.tsx` or `src/components/ui/<stem>.tsx` (no nested dirs). */
const CANONICAL_UI_PATH_RE = /^(?:src\/)?components\/ui\/([^/]+)\.tsx$/i;

/**
 * Return the canonical shadcn stem for a generated path if it is a host-owned
 * shadcn UI file (`@/components/ui/<stem>`), otherwise `null`. Custom files
 * under `components/ui/` whose stem is not in the registry return `null` and
 * are therefore preserved untouched.
 */
function canonicalShadcnUiStem(path: string): string | null {
  const match = CANONICAL_UI_PATH_RE.exec(path.replace(/\\/g, "/"));
  if (!match) return null;
  const stem = match[1].toLowerCase();
  return CANONICAL_SHADCN_UI_STEMS.has(stem) ? stem : null;
}

/** `<stem>` for a `uiComponents` entry filename (`carousel.tsx` → `carousel`). */
function uiComponentStem(filename: string): string {
  return filename
    .replace(/\\/g, "/")
    .replace(/\.tsx$/i, "")
    .toLowerCase();
}

export function buildCompleteProject(
  generatedFiles: CodeFile[],
  uiComponents?: Array<{ filename: string; content: string }>,
): CodeFile[] {
  const result: CodeFile[] = [];

  const baselineOwnedStems = buildBaselineOwnedStems();

  // Stems for which a canonical replacement is actually available to inject.
  // We only drop an LLM-emitted canonical shadcn file when its host-provided
  // replacement exists here, so we never delete a UI file without re-injecting
  // a working one (avoids breaking `@/components/ui/*` imports).
  const availableCanonicalUiStems = new Set<string>(
    (uiComponents ?? []).map((comp) => uiComponentStem(comp.filename)),
  );

  const filteredGeneratedFiles: CodeFile[] = [];
  for (const file of generatedFiles) {
    const stem = moduleStemForCollision(file.path);
    if (stem !== null && baselineOwnedStems.has(stem)) {
      const canonicalPath = baselineOwnedStems.get(stem);
      if (canonicalPath !== file.path.replace(/\\/g, "/")) {
        // Extension collision against a baseline-owned helper — drop the
        // generated sibling so the baseline file is the single source.
        continue;
      }
    }

    // The LLM (or a repair round) sometimes emits its own copy of a canonical
    // shadcn component under `components/ui/`. That file would otherwise win
    // over the host-provided canonical one and ship — a real incident was a
    // generated `components/ui/carousel.tsx` with a self-import
    // (`import { Carousel } from "@/components/ui/carousel"`) next to
    // `function Carousel(){}` → TS2440 → broken build. Drop it so the
    // canonical version (injected below from `uiComponents`) wins. Only drop
    // when that replacement is available; otherwise keep the generated file.
    const canonicalUiStem = canonicalShadcnUiStem(file.path);
    if (canonicalUiStem !== null && availableCanonicalUiStems.has(canonicalUiStem)) {
      continue;
    }

    filteredGeneratedFiles.push(file);
  }

  const generatedPaths = new Set(filteredGeneratedFiles.map((f) => f.path));

  const allCode = [
    ...filteredGeneratedFiles.map((f) => f.content),
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

  result.push(
    ...filteredGeneratedFiles.map((file) => mergeModelTsconfig(mergeModelPackageJson(file))),
  );

  if (!result.some((f) => f.path === ".env.local")) {
    const envBody = buildPlaceholderEnvLocalBody();
    if (envBody) {
      result.push({ path: ".env.local", content: envBody, language: "text" });
    }
  }

  return result.sort((a, b) => a.path.localeCompare(b.path));
}


