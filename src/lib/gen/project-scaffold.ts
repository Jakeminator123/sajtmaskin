import fs from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { runDepCompleter, KNOWN_PACKAGES } from "./autofix/dep-completer";
import {
  collectExternalPackageNames,
  ensureDependenciesInPackageJson,
  SHADCN_FALLBACK_VERSIONS,
} from "@/lib/deploy/dependency-utils";
import type { CodeFile } from "./parser";

/**
 * Download/export scaffold.
 *
 * This is separate from the small runtime scaffolds under `gen/scaffolds/`:
 * - runtime scaffolds shape the model prompt before generation
 * - this file fills in missing project boilerplate when exporting/downloading
 *
 * `_template_refs/` is a third, separate concept: research material only.
 */
const PACKAGE_JSON = `{
  "name": "sajtmaskin-project",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^16.1.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "radix-ui": "^1.4.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.3.0",
    "lucide-react": "^0.513.0",
    "next-themes": "^0.4.6",
    "sonner": "^2.0.7",
    "recharts": "^2.15.4",
    "cmdk": "^1.1.1",
    "vaul": "^1.1.2",
    "input-otp": "^1.4.2",
    "embla-carousel-react": "^8.6.0",
    "react-day-picker": "^9.14.0",
    "react-resizable-panels": "^4.7.2",
    "react-hook-form": "^7.71.2",
    "@hookform/resolvers": "^5.2.2",
    "zod": "^4.3.6",
    "framer-motion": "^12.12.1",
    "three": "^0.176.0",
    "@react-three/fiber": "^9.1.2",
    "@react-three/drei": "^10.1.5",
    "date-fns": "^4.1.0",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-tabs": "^1.1.12",
    "@radix-ui/react-tooltip": "^1.1.14",
    "@radix-ui/react-accordion": "^1.2.8",
    "@radix-ui/react-collapsible": "^1.1.12",
    "@radix-ui/react-select": "^2.1.15",
    "@radix-ui/react-switch": "^1.1.8",
    "@radix-ui/react-checkbox": "^1.1.9",
    "@radix-ui/react-label": "^2.1.6",
    "@radix-ui/react-scroll-area": "^1.2.9",
    "@radix-ui/react-separator": "^1.1.6",
    "@radix-ui/react-slot": "^1.2.0",
    "@radix-ui/react-avatar": "^1.1.8",
    "@radix-ui/react-popover": "^1.1.15"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "@types/node": "^22.15.18",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "@tailwindcss/postcss": "^4.1.5",
    "tailwindcss": "^4.1.5"
  }
}`;

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
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}`;

const NEXT_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "*.blob.vercel-storage.com" },
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "via.placeholder.com" },
    ],
  },
};

export default nextConfig;
`;

const POSTCSS_CONFIG = `const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
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
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv" className="dark">
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

const SCAFFOLD_FILES: Record<string, string> = {
  "package.json": PACKAGE_JSON,
  "tsconfig.json": TSCONFIG,
  "next.config.ts": NEXT_CONFIG,
  "postcss.config.mjs": POSTCSS_CONFIG,
  "app/globals.css": GLOBALS_CSS,
  "app/layout.tsx": LAYOUT_TSX,
  "app/robots.ts": ROBOTS_TS,
  "app/sitemap.ts": SITEMAP_TS,
  "lib/utils.ts": LIB_UTILS,
};

export function buildCompleteProject(generatedFiles: CodeFile[]): CodeFile[] {
  const result: CodeFile[] = [];
  const generatedPaths = new Set(generatedFiles.map((f) => f.path));

  const allCode = generatedFiles.map((f) => f.content).join("\n");
  const detected = runDepCompleter(allCode);

  for (const [filePath, content] of Object.entries(SCAFFOLD_FILES)) {
    if (filePath === "package.json") {
      const generatedPkg = generatedFiles.find((f) => f.path === "package.json");
      try {
        const canonical = JSON.parse(content);
        canonical.dependencies = { ...canonical.dependencies, ...detected.dependencies };
        if (generatedPkg) {
          const modelPkg = JSON.parse(generatedPkg.content);
          canonical.dependencies = { ...canonical.dependencies, ...(modelPkg.dependencies ?? {}) };
          canonical.devDependencies = { ...canonical.devDependencies, ...(modelPkg.devDependencies ?? {}) };
          if (modelPkg.name && typeof modelPkg.name === "string") {
            canonical.name = modelPkg.name;
          }
        }
        result.push({ path: filePath, content: JSON.stringify(canonical, null, 2), language: "json" });
      } catch {
        result.push({ path: filePath, content, language: "json" });
      }
      if (generatedPkg) {
        generatedPaths.delete("package.json");
      }
      continue;
    }
    if (!generatedPaths.has(filePath)) {
      result.push({ path: filePath, content, language: inferLanguage(filePath) });
    }
  }

  const uiComponents = collectRequiredUiComponents(generatedFiles);
  for (const comp of uiComponents) {
    const destPath = `components/ui/${comp.filename}`;
    if (!generatedPaths.has(destPath)) {
      result.push({ path: destPath, content: comp.content, language: "tsx" });
    }
  }

  const mergedPaths = new Set(result.map((f) => f.path));
  for (const file of generatedFiles) {
    if (!mergedPaths.has(file.path)) {
      result.push(file);
    }
  }

  // Second pass: scan all files for external imports and patch any that the
  // first pass (dep-completer KNOWN_PACKAGES + canonical scaffold) missed.
  // Uses the same robust specifier parser the deploy pipeline uses.
  const pkgIdx = result.findIndex((f) => f.path === "package.json");
  if (pkgIdx !== -1) {
    const allFiles = result.map((f) => ({ name: f.path, content: f.content }));
    const externalPackages = collectExternalPackageNames(allFiles);
    if (externalPackages.size > 0) {
      const versionMap = { ...KNOWN_PACKAGES, ...SHADCN_FALLBACK_VERSIONS };
      try {
        const canonical = JSON.parse(PACKAGE_JSON);
        Object.assign(versionMap, canonical.dependencies ?? {});
        Object.assign(versionMap, canonical.devDependencies ?? {});
      } catch { /* canonical parse already succeeded above */ }
      const patched = ensureDependenciesInPackageJson({
        packageJsonContent: result[pkgIdx].content,
        requiredPackages: externalPackages,
        versionMap,
      });
      result[pkgIdx] = { ...result[pkgIdx], content: patched.content };
    }
  }

  return result.sort((a, b) => a.path.localeCompare(b.path));
}

const UI_IMPORT_RE = /@\/components\/ui\/([a-z][a-z0-9-]*)/g;
const PROJECT_SCAFFOLD_DIR = nodePath.dirname(fileURLToPath(import.meta.url));
const SRC_UI_COMPONENT_DIR = nodePath.resolve(PROJECT_SCAFFOLD_DIR, "../../components/ui");
const ROOT_UI_COMPONENT_DIR = nodePath.resolve(PROJECT_SCAFFOLD_DIR, "../../../components/ui");

interface UiComponent {
  filename: string;
  content: string;
}

let uiComponentIndexCache: Map<string, UiComponent> | null = null;

function collectRequiredUiComponents(files: CodeFile[]): UiComponent[] {
  const needed = new Set<string>();
  for (const file of files) {
    for (const match of file.content.matchAll(UI_IMPORT_RE)) {
      needed.add(match[1]);
    }
  }

  const componentIndex = getUiComponentIndex();
  const resolved = new Map<string, UiComponent>();
  const queue = [...needed];

  while (queue.length > 0) {
    const name = queue.shift();
    if (!name || resolved.has(name)) continue;

    const component = readUiComponent(name, componentIndex);
    if (!component) continue;

    resolved.set(name, component);

    for (const match of component.content.matchAll(UI_IMPORT_RE)) {
      const dependency = match[1];
      if (!resolved.has(dependency)) {
        queue.push(dependency);
      }
    }
  }

  return Array.from(resolved.values());
}

function getUiComponentIndex(): Map<string, UiComponent> {
  if (uiComponentIndexCache) {
    return uiComponentIndexCache;
  }

  const index = new Map<string, UiComponent>();
  readUiComponentDirIntoIndex(SRC_UI_COMPONENT_DIR, index);
  readUiComponentDirIntoIndex(ROOT_UI_COMPONENT_DIR, index);

  uiComponentIndexCache = index;
  return index;
}

function readUiComponentDirIntoIndex(dir: string, index: Map<string, UiComponent>): void {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) continue;
    const componentName = entry.name.slice(0, -4);
    if (!componentName || index.has(componentName)) continue;
    const fullPath = nodePath.join(dir, entry.name);
    index.set(componentName, {
      filename: entry.name,
      content: fs.readFileSync(fullPath, "utf-8"),
    });
  }
}

function readUiComponent(name: string, componentIndex: Map<string, UiComponent>): UiComponent | null {
  return componentIndex.get(name) ?? null;
}

function inferLanguage(filePath: string): string {
  if (filePath.endsWith(".tsx")) return "tsx";
  if (filePath.endsWith(".ts")) return "ts";
  if (filePath.endsWith(".jsx")) return "jsx";
  if (filePath.endsWith(".js")) return "js";
  if (filePath.endsWith(".css")) return "css";
  if (filePath.endsWith(".json")) return "json";
  if (filePath.endsWith(".mjs")) return "js";
  return "text";
}
