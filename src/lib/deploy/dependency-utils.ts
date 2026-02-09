import fs from "fs";
import path from "path";
import { builtinModules } from "module";

export type DependencyVersionMap = Record<string, string>;

const BUILTIN_MODULES = new Set(builtinModules);
const DEFAULT_PACKAGE_JSON_INDENT = 2;

let cachedVersionMap: DependencyVersionMap | null = null;

export const SHADCN_BASELINE_PACKAGES = [
  // Radix UI primitives — all packages commonly used by shadcn/ui components
  "@radix-ui/react-accordion",
  "@radix-ui/react-alert-dialog",
  "@radix-ui/react-aspect-ratio",
  "@radix-ui/react-avatar",
  "@radix-ui/react-checkbox",
  "@radix-ui/react-collapsible",
  "@radix-ui/react-context-menu",
  "@radix-ui/react-dialog",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-hover-card",
  "@radix-ui/react-label",
  "@radix-ui/react-menubar",
  "@radix-ui/react-navigation-menu",
  "@radix-ui/react-popover",
  "@radix-ui/react-progress",
  "@radix-ui/react-radio-group",
  "@radix-ui/react-scroll-area",
  "@radix-ui/react-select",
  "@radix-ui/react-separator",
  "@radix-ui/react-slider",
  "@radix-ui/react-slot",
  "@radix-ui/react-switch",
  "@radix-ui/react-tabs",
  "@radix-ui/react-toast",
  "@radix-ui/react-toggle",
  "@radix-ui/react-toggle-group",
  "@radix-ui/react-tooltip",
  "@radix-ui/react-use-controllable-state",
  // Core shadcn utilities
  "class-variance-authority",
  "clsx",
  "lucide-react",
  "tailwind-merge",
  // Common extras used by shadcn components
  "next-themes",
  "tw-animate-css",
];

/**
 * Fallback versions for shadcn/ui-related packages.
 * Used when a package is detected in generated code but is not present
 * in the hosting repo's own package.json. Keeps deploys working even
 * when v0 emits imports the repo doesn't use locally.
 *
 * These should be updated periodically to stay current.
 */
export const SHADCN_FALLBACK_VERSIONS: DependencyVersionMap = {
  // Radix UI primitives
  "@radix-ui/react-accordion": "^1.2.3",
  "@radix-ui/react-alert-dialog": "^1.1.6",
  "@radix-ui/react-aspect-ratio": "^1.1.3",
  "@radix-ui/react-avatar": "^1.1.6",
  "@radix-ui/react-checkbox": "^1.1.5",
  "@radix-ui/react-collapsible": "^1.1.12",
  "@radix-ui/react-context-menu": "^2.2.10",
  "@radix-ui/react-dialog": "^1.1.15",
  "@radix-ui/react-dropdown-menu": "^2.1.16",
  "@radix-ui/react-hover-card": "^1.1.15",
  "@radix-ui/react-label": "^2.1.3",
  "@radix-ui/react-menubar": "^1.1.11",
  "@radix-ui/react-navigation-menu": "^1.2.10",
  "@radix-ui/react-popover": "^1.1.10",
  "@radix-ui/react-progress": "^1.1.8",
  "@radix-ui/react-radio-group": "^1.2.6",
  "@radix-ui/react-scroll-area": "^1.2.10",
  "@radix-ui/react-select": "^2.2.6",
  "@radix-ui/react-separator": "^1.1.8",
  "@radix-ui/react-slider": "^1.2.6",
  "@radix-ui/react-slot": "^1.2.4",
  "@radix-ui/react-switch": "^1.1.6",
  "@radix-ui/react-tabs": "^1.1.6",
  "@radix-ui/react-toast": "^1.2.10",
  "@radix-ui/react-toggle": "^1.1.7",
  "@radix-ui/react-toggle-group": "^1.1.8",
  "@radix-ui/react-tooltip": "^1.2.8",
  "@radix-ui/react-use-controllable-state": "^1.2.2",
  // Core shadcn utilities
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "lucide-react": "^0.563.0",
  "tailwind-merge": "^3.4.0",
  // Common extras used by shadcn components
  "cmdk": "^1.1.1",
  "embla-carousel-react": "^8.6.0",
  "input-otp": "^1.4.2",
  "react-day-picker": "^9.6.4",
  "react-resizable-panels": "^2.1.7",
  "recharts": "^2.15.3",
  "vaul": "^1.1.2",
  "next-themes": "^0.4.6",
  "sonner": "^2.0.7",
  "tw-animate-css": "^1.3.4",
  "framer-motion": "^12.29.0",
};

export function getRepoDependencyVersionMap(): DependencyVersionMap {
  if (cachedVersionMap) return cachedVersionMap;
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = {
      ...(parsed.dependencies || {}),
      ...(parsed.devDependencies || {}),
    };
    cachedVersionMap = Object.fromEntries(
      Object.entries(deps).filter(([, value]) => typeof value === "string" && value.trim()),
    );
  } catch (error) {
    console.warn("[Deps] Failed to read repo package.json:", error);
    cachedVersionMap = {};
  }
  return cachedVersionMap;
}

/**
 * Return a version map that merges the repo's own package.json versions
 * with SHADCN_FALLBACK_VERSIONS. Repo versions take precedence so
 * locally pinned versions are respected; fallback fills the gaps for
 * packages the repo doesn't use but v0-generated code may reference.
 */
export function getDeployVersionMap(): DependencyVersionMap {
  const repo = getRepoDependencyVersionMap();
  // Spread fallback first, then repo on top so repo wins on conflicts
  return { ...SHADCN_FALLBACK_VERSIONS, ...repo };
}

export function getPackageNameFromImport(specifier: string): string | null {
  const trimmed = specifier.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.startsWith("@/")) return null;
  if (trimmed.startsWith("node:")) return null;
  if (trimmed.startsWith("#")) return null;
  if (BUILTIN_MODULES.has(trimmed)) return null;
  if (trimmed.startsWith("@")) {
    const parts = trimmed.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  const base = trimmed.split("/")[0];
  return BUILTIN_MODULES.has(base) ? null : base;
}

function collectImportSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  const importRegex = /\bimport\s+[^'"]*?['"]([^'"]+)['"]/g;
  const exportRegex = /\bexport\s+[^'"]*?from\s*['"]([^'"]+)['"]/g;
  const requireRegex = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const dynamicImportRegex = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const addMatches = (regex: RegExp) => {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) specifiers.push(match[1]);
    }
  };
  addMatches(importRegex);
  addMatches(exportRegex);
  addMatches(requireRegex);
  addMatches(dynamicImportRegex);
  return specifiers;
}

export function collectExternalPackageNames(
  files: Array<{ name: string; content: string }>,
): Set<string> {
  const packages = new Set<string>();
  const shouldScan = (name: string) => /\.(t|j)sx?$/.test(name);
  for (const file of files) {
    if (!shouldScan(file.name) || typeof file.content !== "string") continue;
    for (const spec of collectImportSpecifiers(file.content)) {
      const pkg = getPackageNameFromImport(spec);
      if (pkg) packages.add(pkg);
    }
  }
  return packages;
}

export function ensureDependenciesInPackageJson(params: {
  packageJsonContent: string;
  requiredPackages: Iterable<string>;
  versionMap: DependencyVersionMap;
}): { content: string; added: string[]; missing: string[] } {
  const { packageJsonContent, requiredPackages, versionMap } = params;
  const added: string[] = [];
  const missing: string[] = [];
  const parsed = JSON.parse(packageJsonContent) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: unknown;
  };
  const dependencies = { ...(parsed.dependencies || {}) };
  const devDependencies = parsed.devDependencies || {};

  for (const pkg of requiredPackages) {
    if (dependencies[pkg]) continue;
    if (devDependencies[pkg]) {
      dependencies[pkg] = devDependencies[pkg];
      added.push(pkg);
      continue;
    }
    const version = versionMap[pkg];
    if (version) {
      dependencies[pkg] = version;
      added.push(pkg);
    } else {
      missing.push(pkg);
    }
  }

  const next = {
    ...parsed,
    dependencies: Object.keys(dependencies).length ? dependencies : {},
  };

  return {
    content: `${JSON.stringify(next, null, DEFAULT_PACKAGE_JSON_INDENT)}\n`,
    added,
    missing,
  };
}
