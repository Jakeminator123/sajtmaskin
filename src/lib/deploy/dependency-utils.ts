import fs from "fs";
import path from "path";
import { builtinModules } from "module";

export type DependencyVersionMap = Record<string, string>;

const BUILTIN_MODULES = new Set(builtinModules);
const DEFAULT_PACKAGE_JSON_INDENT = 2;

let cachedVersionMap: DependencyVersionMap | null = null;

export const SHADCN_BASELINE_PACKAGES = [
  "@radix-ui/react-collapsible",
  "@radix-ui/react-dialog",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-hover-card",
  "@radix-ui/react-progress",
  "@radix-ui/react-scroll-area",
  "@radix-ui/react-select",
  "@radix-ui/react-separator",
  "@radix-ui/react-slot",
  "@radix-ui/react-tooltip",
  "@radix-ui/react-use-controllable-state",
  "class-variance-authority",
  "clsx",
  "lucide-react",
  "tailwind-merge",
];

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
