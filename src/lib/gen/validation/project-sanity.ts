import type { CodeFile } from "@/lib/gen/parser";
import { parseImports } from "@/lib/gen/preview/import-parser";
import {
  collectExternalPackageNames,
  getPackageNameFromImport,
} from "@/lib/deploy/dependency-utils";

export interface SanityIssue {
  file: string;
  severity: "error" | "warning";
  message: string;
}

export interface SanityResult {
  issues: SanityIssue[];
  valid: boolean;
}

const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const INDEX_EXTENSIONS = EXTENSIONS.map((ext) => `/index${ext}`);

const FONT_USAGE_RE = /\b(Inter|Geist|Geist_Mono|Roboto|Open_Sans|Lato|Montserrat|Poppins|Raleway|Nunito)\s*\(/;
const FONT_IMPORT_RE = /import\s+\{[^}]*\}\s+from\s+["']next\/font\/google["']/;
const USE_CLIENT_RE = /^["']use client["'];?\s*$/m;
const METADATA_EXPORT_RE =
  /\bexport\s+(?:const\s+metadata\b|(?:async\s+)?function\s+generateMetadata\b)/;

function fileExists(fileMap: Map<string, CodeFile>, basePath: string): boolean {
  if (fileMap.has(basePath)) return true;
  for (const ext of [...EXTENSIONS, ...INDEX_EXTENSIONS]) {
    if (fileMap.has(basePath + ext)) return true;
  }
  if (fileMap.has(`src/${basePath}`)) return true;
  for (const ext of [...EXTENSIONS, ...INDEX_EXTENSIONS]) {
    if (fileMap.has(`src/${basePath}${ext}`)) return true;
  }
  return false;
}

function resolveExistingProjectPath(
  fileMap: Map<string, CodeFile>,
  basePath: string,
): string | null {
  const candidates = [
    basePath,
    ...[...EXTENSIONS, ...INDEX_EXTENSIONS].map((ext) => `${basePath}${ext}`),
    `src/${basePath}`,
    ...[...EXTENSIONS, ...INDEX_EXTENSIONS].map((ext) => `src/${basePath}${ext}`),
  ];
  return candidates.find((candidate) => fileMap.has(candidate)) ?? null;
}

function normalizeToProjectPath(source: string, importerPath: string): string {
  if (source.startsWith("@/")) return source.slice(2);
  const dir = importerPath.includes("/")
    ? importerPath.slice(0, importerPath.lastIndexOf("/"))
    : ".";
  const parts = [...dir.split("/"), ...source.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") resolved.pop();
    else if (part !== ".") resolved.push(part);
  }
  return resolved.join("/");
}

function collectNamedExports(code: string): Set<string> {
  const names = new Set<string>();
  const addMatch = (regex: RegExp) => {
    for (const match of code.matchAll(regex)) {
      const name = match[1]?.trim();
      if (name) names.add(name);
    }
  };

  addMatch(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g);
  addMatch(/export\s+class\s+([A-Za-z_$][\w$]*)/g);
  addMatch(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g);

  for (const match of code.matchAll(/export\s*\{([^}]+)\}/g)) {
    const parts = match[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) {
      const aliasMatch = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      names.add(aliasMatch ? aliasMatch[2] : part);
    }
  }

  return names;
}

/**
 * Post-merge sanity checks on the full generated file set.
 * Catches issues that per-file autofix cannot see.
 */
export function runProjectSanityChecks(files: CodeFile[]): SanityResult {
  const fileMap = new Map<string, CodeFile>();
  for (const f of files) fileMap.set(f.path, f);

  const issues: SanityIssue[] = [];

  for (const file of files) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;

    // 1. Unresolved local imports and export-shape mismatches
    for (const imp of parseImports(file.content)) {
      const source = imp.source;
      if (!source.startsWith("@/") && !source.startsWith("./") && !source.startsWith("../")) continue;
      if (source.startsWith("@/components/ui/") || source === "@/lib/utils") continue;

      const projectPath = normalizeToProjectPath(source, file.path);
      if (!fileExists(fileMap, projectPath)) {
        issues.push({
          file: file.path,
          severity: "warning",
          message: `Unresolved local import: ${source}`,
        });
        continue;
      }

      const resolvedPath = resolveExistingProjectPath(fileMap, projectPath);
      const targetFile = resolvedPath ? fileMap.get(resolvedPath) : null;
      if (!targetFile) {
        continue;
      }

      const hasDefaultExport = /\bexport\s+default\b/.test(targetFile.content);
      const namedExports = collectNamedExports(targetFile.content);

      if (imp.defaultImport && !hasDefaultExport) {
        issues.push({
          file: file.path,
          severity: "error",
          message: `Local import expects a default export from ${source}, but none was found`,
        });
      }

      for (const binding of imp.namedImports) {
        if (namedExports.has(binding.imported)) continue;
        issues.push({
          file: file.path,
          severity: "error",
          message: hasDefaultExport
            ? `Local import expects named export ${binding.imported} from ${source}, but the target only exposes a default export`
            : `Local import expects named export ${binding.imported} from ${source}, but none was found`,
        });
      }
    }

    // 2. Font usage without import
    if (file.path.includes("layout")) {
      const fontMatch = file.content.match(FONT_USAGE_RE);
      if (fontMatch && !FONT_IMPORT_RE.test(file.content)) {
        issues.push({
          file: file.path,
          severity: "error",
          message: `Font ${fontMatch[1]} is used but not imported from next/font/google`,
        });
      }
    }

    // 2b. Preview-only stripped imports must never leak into saved/exported code
    if (file.content.includes("(stripped for preview compatibility)")) {
      issues.push({
        file: file.path,
        severity: "error",
        message: "Preview-only stripped import leaked into saved project files",
      });
    }

    // 3. Default export check for page/layout files
    if (file.path.match(/\/(page|layout)\.(tsx|jsx)$/)) {
      if (!file.content.includes("export default")) {
        issues.push({
          file: file.path,
          severity: "error",
          message: "Page/layout file is missing a default export",
        });
      }
    }

    // 3b. App Router metadata is not allowed in client components
    if (
      file.path.match(/(^|\/)(page|layout)\.(tsx|jsx)$/) &&
      USE_CLIENT_RE.test(file.content) &&
      METADATA_EXPORT_RE.test(file.content)
    ) {
      issues.push({
        file: file.path,
        severity: "error",
        message: 'Client component exports metadata/generateMetadata, which Next.js App Router disallows',
      });
    }
  }

  // 4. package.json must have valid scripts and core dependencies for Next.js
  const packageJson = fileMap.get("package.json");
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson.content);
      const scripts = pkg.scripts ?? {};
      if (!scripts.dev || !scripts.build) {
        issues.push({
          file: "package.json",
          severity: "error",
          message: "package.json is missing required scripts (dev and/or build)",
        });
      }
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      for (const required of ["next", "react", "react-dom"]) {
        if (!deps[required]) {
          issues.push({
            file: "package.json",
            severity: "error",
            message: `package.json is missing core dependency: ${required}`,
          });
        }
      }
    } catch {
      issues.push({
        file: "package.json",
        severity: "error",
        message: "package.json contains invalid JSON",
      });
    }
  }

  // 5. External imports must have corresponding package.json entries
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson.content);
      const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      const codeFiles = files.filter((f) => /\.(tsx?|jsx?)$/.test(f.path));
      const externalPackages = collectExternalPackageNames(
        codeFiles.map((f) => ({ name: f.path, content: f.content })),
      );
      for (const pkgName of externalPackages) {
        if (allDeps[pkgName]) continue;
        issues.push({
          file: "package.json",
          severity: "warning",
          message: `External import "${pkgName}" has no matching entry in package.json`,
        });
      }
    } catch { /* JSON parse already validated above */ }
  }

  // 6. globals.css must exist and contain @theme
  const globalsCss = fileMap.get("app/globals.css") ?? fileMap.get("src/app/globals.css");
  if (!globalsCss) {
    issues.push({
      file: "app/globals.css",
      severity: "warning",
      message: "globals.css is missing from generated files",
    });
  } else if (!globalsCss.content.includes("@theme")) {
    issues.push({
      file: globalsCss.path,
      severity: "warning",
      message: "globals.css does not contain @theme inline color tokens",
    });
  }

  // 7. layout.tsx must exist
  const layout = fileMap.get("app/layout.tsx") ?? fileMap.get("src/app/layout.tsx");
  if (!layout) {
    issues.push({
      file: "app/layout.tsx",
      severity: "warning",
      message: "layout.tsx is missing from generated files",
    });
  }

  // 8. Duplicate route detection
  const routes = new Set<string>();
  for (const file of files) {
    const routeMatch = file.path.match(/^(?:src\/)?app(\/.*)\/(page|layout)\.(tsx|jsx|ts|js)$/);
    if (routeMatch) {
      const route = `${routeMatch[1]}/${routeMatch[2]}`;
      if (routes.has(route)) {
        issues.push({
          file: file.path,
          severity: "warning",
          message: `Duplicate route file: ${route}`,
        });
      }
      routes.add(route);
    }
  }

  return {
    issues,
    valid: issues.filter((i) => i.severity === "error").length === 0,
  };
}
