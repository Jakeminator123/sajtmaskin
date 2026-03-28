import fs from "node:fs";
import nodePath from "node:path";
import { runDepCompleter } from "./autofix/dep-completer";
import type { CodeFile } from "./parser";
import { loadPlaceholderRecord, formatDotenvBody } from "./sandbox-env-local";

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
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "16.2.1",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "radix-ui": "1.4.3",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "tailwind-merge": "3.3.0",
    "lucide-react": "0.513.0",
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
    "framer-motion": "12.12.1",
    "three": "0.176.0",
    "@react-three/fiber": "9.1.2",
    "@react-three/drei": "10.7.7",
    "date-fns": "4.1.0",
    "@radix-ui/react-dialog": "1.1.15",
    "@radix-ui/react-dropdown-menu": "2.1.15",
    "@radix-ui/react-tabs": "1.1.12",
    "@radix-ui/react-tooltip": "1.2.8",
    "@radix-ui/react-accordion": "1.2.8",
    "@radix-ui/react-collapsible": "1.1.12",
    "@radix-ui/react-select": "2.2.6",
    "@radix-ui/react-switch": "1.2.6",
    "@radix-ui/react-checkbox": "1.3.3",
    "@radix-ui/react-label": "2.1.6",
    "@radix-ui/react-scroll-area": "1.2.9",
    "@radix-ui/react-separator": "1.1.6",
    "@radix-ui/react-slot": "1.2.0",
    "@radix-ui/react-avatar": "1.1.8",
    "@radix-ui/react-popover": "1.1.15"
  },
  "devDependencies": {
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

const GENERATED_ENV_LOCAL_HEADER = `# Sajtmaskin — placeholder .env.local for local development (not production secrets)
# Same keys as sandbox preview; override with real values when deploying.
`;

/**
 * Model `package.json` is merged **onto** the Sajtmaskin baseline so scripts, devDependencies,
 * and core tooling survive thin LLM output (zip export / sandbox use the same merge).
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

  return {
    ...b,
    ...model,
    scripts: { ...bScripts, ...mScripts },
    dependencies: { ...bDep, ...mDep, ...detected.dependencies },
    devDependencies: { ...bDevDep, ...mDevDep },
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

export function buildCompleteProject(generatedFiles: CodeFile[]): CodeFile[] {
  const result: CodeFile[] = [];
  const generatedPaths = new Set(generatedFiles.map((f) => f.path));

  const allCode = generatedFiles.map((f) => f.content).join("\n");
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

  for (const [filePath, content] of Object.entries(SCAFFOLD_FILES)) {
    if (filePath === "package.json" && !generatedPaths.has(filePath)) {
      const merged = mergePackageJsonWithBaseline({}, detected);
      result.push({ path: filePath, content: JSON.stringify(merged, null, 2), language: "json" });
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

  result.push(...generatedFiles.map(mergeModelPackageJson));

  if (!result.some((f) => f.path === ".env.local")) {
    const envBody = buildPlaceholderEnvLocalBody();
    if (envBody) {
      result.push({ path: ".env.local", content: envBody, language: "text" });
    }
  }

  return result.sort((a, b) => a.path.localeCompare(b.path));
}

const UI_IMPORT_RE = /@\/components\/ui\/([a-z][a-z0-9-]*)/g;

interface UiComponent {
  filename: string;
  content: string;
}

function collectRequiredUiComponents(files: CodeFile[]): UiComponent[] {
  const needed = new Set<string>();
  for (const file of files) {
    for (const match of file.content.matchAll(UI_IMPORT_RE)) {
      needed.add(match[1]);
    }
  }

  const searchDirs = [
    nodePath.resolve(process.cwd(), "src/components/ui"),
    nodePath.resolve(process.cwd(), "components/ui"),
  ];
  const resolved = new Map<string, UiComponent>();
  const queue = [...needed];

  while (queue.length > 0) {
    const name = queue.shift();
    if (!name || resolved.has(name)) continue;

    const content = readUiComponent(name, searchDirs);
    if (!content) continue;

    resolved.set(name, { filename: `${name}.tsx`, content });

    for (const match of content.matchAll(UI_IMPORT_RE)) {
      const dependency = match[1];
      if (!resolved.has(dependency)) {
        queue.push(dependency);
      }
    }
  }

  return Array.from(resolved.values());
}

function readUiComponent(name: string, searchDirs: string[]): string | null {
  const filename = `${name}.tsx`;

  for (const dir of searchDirs) {
    const fullPath = nodePath.join(dir, filename);
    try {
      return fs.readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }
  }

  return null;
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
