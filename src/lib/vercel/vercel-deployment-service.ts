/**
 * Vercel Deployment Service
 * =========================
 * High-level service for deploying projects to Vercel.
 * Used by the integration layer and API routes.
 *
 * IMPORTANT: v0 returns files with simple names like "page.tsx", not "app/page.tsx".
 * This service normalizes paths and adds all required scaffolding files for Next.js.
 */

import {
  createDeployment,
  createOrUpdateProject,
  isVercelConfigured,
  getDeploymentStatus,
  listEnvironmentVariables,
  setEnvironmentVariable,
} from "@/lib/vercel/vercel-client";
import { getProjectData } from "@/lib/db/services";
import {
  SHADCN_BASELINE_PACKAGES,
  ensureDependenciesInPackageJson,
  getDeployVersionMap,
} from "@/lib/deploy/dependency-utils";

interface ProjectFile {
  path: string;
  content: string;
}

export interface DeployProjectOptions {
  projectId: string;
  projectName: string;
  framework?: string;
  env?: Record<string, string>;
  target?: "production" | "staging";
  domain?: string; // Optional custom domain to attach after deployment
  teamId?: string; // Optional team ID for Vercel
}

export interface DeploymentResult {
  success: boolean;
  deploymentId?: string;
  url?: string;
  readyState?: string;
  error?: string;
}

const ALL_ENV_TARGETS: Array<"production" | "preview" | "development"> = [
  "production",
  "preview",
  "development",
];

async function ensureProjectEnvVar(params: {
  projectId: string;
  key: string;
  value: string;
  teamId?: string;
}): Promise<void> {
  try {
    const envs = await listEnvironmentVariables(params.projectId, params.teamId);
    const exists = envs.some((env) => env.key === params.key);
    if (exists) return;

    await setEnvironmentVariable(params.projectId, params.key, params.value, {
      target: ALL_ENV_TARGETS,
      teamId: params.teamId,
    });
  } catch (error) {
    console.warn(
      `[Vercel Deployment] Failed to ensure env ${params.key}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

// ============================================================================
// NEXT.JS SCAFFOLDING FILES
// ============================================================================
// These are the minimum files required for a Next.js 15 app to build on Vercel.
// v0 only returns component files, so we need to add the rest.

const FALLBACK_BASE_VERSIONS: Record<string, string> = {
  next: "15.0.0",
  react: "^18.3.1",
  "react-dom": "^18.3.1",
  "lucide-react": "^0.468.0",
  clsx: "^2.1.1",
  "tailwind-merge": "^2.6.0",
  "class-variance-authority": "^0.7.1",
  "framer-motion": "^11.15.0",
  "@types/node": "^22.10.1",
  "@types/react": "^18.3.12",
  "@types/react-dom": "^18.3.1",
  "@tailwindcss/postcss": "^4.1.18",
  postcss: "^8.5.1",
  tailwindcss: "^4.1.18",
  typescript: "^5.7.2",
};

const BASE_PACKAGE_JSON = (() => {
  const versionMap = getDeployVersionMap();
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  const addVersion = (target: Record<string, string>, pkg: string) => {
    const version = versionMap[pkg] || FALLBACK_BASE_VERSIONS[pkg];
    if (version) {
      target[pkg] = version;
    }
  };
  [
    "next",
    "react",
    "react-dom",
    "lucide-react",
    "clsx",
    "tailwind-merge",
    "class-variance-authority",
    "framer-motion",
  ].forEach((pkg) => addVersion(dependencies, pkg));
  [
    "typescript",
    "@types/react",
    "@types/react-dom",
    "@types/node",
    "tailwindcss",
    "postcss",
    "@tailwindcss/postcss",
  ].forEach((pkg) => addVersion(devDependencies, pkg));

  const base = {
    name: "generated-site",
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
    },
    dependencies,
    devDependencies,
  };
  return `${JSON.stringify(base, null, 2)}\n`;
})();

const PACKAGE_JSON = (() => {
  try {
    const versionMap = getDeployVersionMap();
    const result = ensureDependenciesInPackageJson({
      packageJsonContent: BASE_PACKAGE_JSON,
      requiredPackages: SHADCN_BASELINE_PACKAGES,
      versionMap,
    });
    if (result.missing.length > 0) {
      console.warn(
        "[Vercel Deployment] Missing versions for shadcn deps:",
        result.missing.join(", "),
      );
    }
    return result.content;
  } catch (error) {
    console.warn("[Vercel Deployment] Failed to extend package.json:", error);
    return BASE_PACKAGE_JSON;
  }
})();

const NEXT_CONFIG = `/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

module.exports = nextConfig;
`;

const TAILWIND_CONFIG = `/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {},
  },
  plugins: [],
};
`;

const POSTCSS_CONFIG = `module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
`;

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

const GLOBALS_CSS = `@import "tailwindcss";
@config "../tailwind.config.js";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  color: var(--foreground);
  background: var(--background);
  font-family: Arial, Helvetica, sans-serif;
}
`;

function generateRootLayout(hasGlobals: boolean): string {
  return `${hasGlobals ? 'import "./globals.css";\n' : ""}import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sajtmaskin site",
  description: "Generated by Sajtmaskin",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
`;
}

/**
 * Normalize file paths from v0 format to Next.js app router format.
 * v0 returns files like "page.tsx", we need "app/page.tsx".
 */
function normalizeFilePath(originalPath: string): string {
  const path = originalPath.trim();

  // Already has proper path structure
  if (path.startsWith("app/") || path.startsWith("src/app/")) {
    return path;
  }

  // Config files stay in root
  if (
    path === "package.json" ||
    path === "next.config.js" ||
    path === "next.config.ts" ||
    path === "tailwind.config.cjs" ||
    path === "tailwind.config.js" ||
    path === "tailwind.config.ts" ||
    path === "postcss.config.js" ||
    path === "postcss.config.mjs" ||
    path === "tsconfig.json"
  ) {
    return path;
  }

  // CSS files go to app/
  if (path === "globals.css" || path === "global.css") {
    return `app/${path}`;
  }

  // Page files go to app/
  if (path === "page.tsx" || path === "page.jsx" || path === "page.js") {
    return `app/${path}`;
  }

  // Layout files go to app/
  if (path === "layout.tsx" || path === "layout.jsx" || path === "layout.js") {
    return `app/${path}`;
  }

  // Component files - check if it looks like a component
  if (path.endsWith(".tsx") || path.endsWith(".jsx")) {
    // If it's just a component file, put in components/
    if (!path.includes("/")) {
      return `components/${path}`;
    }
  }

  // Default: assume it goes in app/
  if (!path.includes("/")) {
    return `app/${path}`;
  }

  return path;
}

/**
 * Deploy a project to Vercel
 */
export async function deployProject(options: DeployProjectOptions): Promise<DeploymentResult> {
  if (!isVercelConfigured()) {
    return {
      success: false,
      error: "Vercel API token not configured. Set VERCEL_TOKEN.",
    };
  }

  try {
    const resolvedTeamId = options.teamId || process.env.VERCEL_TEAM_ID?.trim() || undefined;
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();

    // Get project files from project_data
    const projectData = await getProjectData(options.projectId);
    const rawFiles = projectData?.files;

    if (!rawFiles || !Array.isArray(rawFiles) || rawFiles.length === 0) {
      return { success: false, error: "No files found for project" };
    }

    // Convert v0 file format and normalize paths
    const files: ProjectFile[] = rawFiles
      .filter(
        (f): f is { name: string; content: string } =>
          f !== null && typeof f === "object" && "name" in f && "content" in f,
      )
      .map((f) => ({
        path: normalizeFilePath(f.name),
        content: f.content,
      }));

    console.log(
      "[Vercel Deployment] Normalized paths:",
      files.map((f) => f.path),
    );

    // Build the final file map
    const vercelFiles: Record<string, string> = {};

    // Add all project files
    for (const file of files) {
      vercelFiles[file.path] = file.content;
    }

    // Check what scaffolding files are needed
    const hasPackageJson = files.some((f) => f.path === "package.json");
    const hasNextConfig = files.some(
      (f) =>
        f.path === "next.config.js" || f.path === "next.config.ts" || f.path === "next.config.mjs",
    );
    const hasTailwindConfig = files.some(
      (f) =>
        f.path === "tailwind.config.cjs" ||
        f.path === "tailwind.config.js" ||
        f.path === "tailwind.config.ts" ||
        f.path === "tailwind.config.mjs",
    );
    const hasPostcssConfig = files.some(
      (f) =>
        f.path === "postcss.config.js" ||
        f.path === "postcss.config.mjs" ||
        f.path === "postcss.config.cjs",
    );
    const hasTsconfig = files.some((f) => f.path === "tsconfig.json");
    const hasGlobalsCss = files.some(
      (f) => f.path === "app/globals.css" || f.path === "app/global.css",
    );
    const hasLayout = files.some((f) => f.path === "app/layout.tsx" || f.path === "app/layout.jsx");

    // Add missing scaffolding files
    if (!hasPackageJson) {
      vercelFiles["package.json"] = PACKAGE_JSON;
      console.log("[Vercel Deployment] Added package.json");
    }
    if (!hasNextConfig) {
      vercelFiles["next.config.js"] = NEXT_CONFIG;
      console.log("[Vercel Deployment] Added next.config.js");
    }
    if (!hasTailwindConfig) {
      vercelFiles["tailwind.config.js"] = TAILWIND_CONFIG;
      console.log("[Vercel Deployment] Added tailwind.config.js");
    }
    if (!hasPostcssConfig) {
      vercelFiles["postcss.config.js"] = POSTCSS_CONFIG;
      console.log("[Vercel Deployment] Added postcss.config.js");
    }
    if (!hasTsconfig) {
      vercelFiles["tsconfig.json"] = TSCONFIG;
      console.log("[Vercel Deployment] Added tsconfig.json");
    }
    if (!hasGlobalsCss) {
      vercelFiles["app/globals.css"] = GLOBALS_CSS;
      console.log("[Vercel Deployment] Added app/globals.css");
    }
    if (!hasLayout) {
      vercelFiles["app/layout.tsx"] = generateRootLayout(true);
      console.log("[Vercel Deployment] Added app/layout.tsx");
    }

    console.log("[Vercel Deployment] Final file count:", Object.keys(vercelFiles).length);
    console.log("[Vercel Deployment] Files:", Object.keys(vercelFiles).join(", "));

    // Ensure project exists in Vercel
    const project = await createOrUpdateProject(options.projectName, {
      framework: options.framework || "nextjs",
      teamId: resolvedTeamId,
    });

    if (blobToken) {
      await ensureProjectEnvVar({
        projectId: project.id,
        key: "BLOB_READ_WRITE_TOKEN",
        value: blobToken,
        teamId: resolvedTeamId,
      });
    }

    // Create deployment
    const deploymentEnv = {
      ...(options.env || {}),
      ...(blobToken ? { BLOB_READ_WRITE_TOKEN: blobToken } : {}),
    };
    const deployment = await createDeployment({
      name: options.projectName,
      files: vercelFiles,
      projectSettings: { framework: options.framework || "nextjs" },
      target: options.target || "production",
      env: deploymentEnv,
      teamId: resolvedTeamId,
    });

    // Note: Domain assignment is handled separately by the caller
    // (e.g., in purchase-and-deploy route) after deployment is confirmed ready
    // This keeps concerns separated and allows better error handling

    return {
      success: true,
      deploymentId: deployment.deploymentId,
      url: deployment.url,
      readyState: deployment.readyState,
    };
  } catch (error) {
    console.error("[Vercel Deployment] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get deployment status
 */
export async function getProjectDeploymentStatus(deploymentId: string): Promise<{
  id: string;
  url: string;
  readyState: string;
  state: string;
  createdAt: number;
} | null> {
  if (!isVercelConfigured()) {
    return null;
  }

  try {
    return await getDeploymentStatus(deploymentId);
  } catch (error) {
    console.error("[Vercel Deployment] Failed to get status:", error);
    return null;
  }
}
