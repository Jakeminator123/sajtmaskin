import type { CodeFile } from "@/lib/gen/parser";

export interface SanityIssue {
  file: string;
  severity: "error" | "warning";
  message: string;
}

export interface SanityResult {
  issues: SanityIssue[];
  valid: boolean;
}

const IMPORT_RE = /import\s+(?:(?:type\s+)?(?:\{[^}]*\}|[\w$]+)(?:\s*,\s*(?:\{[^}]*\}|[\w$]+))*\s+from\s+)?['"]([^'"]+)['"]/g;
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const INDEX_EXTENSIONS = EXTENSIONS.map((ext) => `/index${ext}`);

const FONT_USAGE_RE = /\b(Inter|Geist|Geist_Mono|Roboto|Open_Sans|Lato|Montserrat|Poppins|Raleway|Nunito)\s*\(/;
const FONT_IMPORT_RE = /import\s+\{[^}]*\}\s+from\s+["']next\/font\/google["']/;

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

    // 1. Unresolved local imports
    for (const match of file.content.matchAll(IMPORT_RE)) {
      const source = match[1];
      if (!source.startsWith("@/") && !source.startsWith("./") && !source.startsWith("../")) continue;
      if (source.startsWith("@/components/ui/") || source === "@/lib/utils") continue;

      const projectPath = normalizeToProjectPath(source, file.path);
      if (!fileExists(fileMap, projectPath)) {
        issues.push({
          file: file.path,
          severity: "warning",
          message: `Unresolved local import: ${source}`,
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
  }

  // 4. globals.css must exist and contain @theme
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

  // 5. layout.tsx must exist
  const layout = fileMap.get("app/layout.tsx") ?? fileMap.get("src/app/layout.tsx");
  if (!layout) {
    issues.push({
      file: "app/layout.tsx",
      severity: "warning",
      message: "layout.tsx is missing from generated files",
    });
  }

  // 6. Duplicate route detection
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
