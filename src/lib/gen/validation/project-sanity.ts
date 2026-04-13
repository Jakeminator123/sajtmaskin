import type { PreflightIssueCategory } from "@/lib/gen/stream/preflight-contract";
import type { CodeFile } from "@/lib/gen/parser";

export interface SanityIssue {
  file: string;
  severity: "error" | "warning";
  message: string;
  category?: PreflightIssueCategory;
}

export interface SanityResult {
  issues: SanityIssue[];
  valid: boolean;
  unresolvedImportFallbackUsed: boolean;
}

const IMPORT_RE = /import\s+(?:(?:type\s+)?(?:\{[^}]*\}|[\w$]+)(?:\s*,\s*(?:\{[^}]*\}|[\w$]+))*\s+from\s+)?['"]([^'"]+)['"]/g;
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const INDEX_EXTENSIONS = EXTENSIONS.map((ext) => `/index${ext}`);
const THIRD_PARTY_SOURCE_RE = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const NESTED_IMPORT_IN_IMPORT_BLOCK_RE = /(^|\n)\s*import\s*\{\s*\n\s*import\s+/m;
const DOUBLE_IMPORT_PREFIX_RE = /^\s*import\s*\{\s*\n\s*import\s+/m;
const MALFORMED_INLINE_NAMED_IMPORT_RE = /^\s*import\s+\{[^}\n]*\bfrom\s+["'][^"']+["'];?\s*$/m;
const LEADING_CONTINUATION_LINE_RE = /^[A-Za-z_$][\w$]*\s*,\s*$/;

const FONT_USAGE_RE = /\b(Inter|Geist|Geist_Mono|Roboto|Open_Sans|Lato|Montserrat|Poppins|Raleway|Nunito)\s*\(/;
const FONT_IMPORT_RE = /import\s+\{[^}]*\}\s+from\s+["']next\/font\/google["']/;
const USE_CLIENT_RE = /^["']use client["'];?\s*$/m;
const METADATA_EXPORT_RE =
  /\bexport\s+(?:const\s+metadata\b|(?:async\s+)?function\s+generateMetadata\b)/;
const BUILTIN_PACKAGES = new Set([
  "react",
  "react-dom",
  "react/jsx-runtime",
  "next",
  "next/font",
  "next/font/google",
  "next/image",
  "next/link",
  "next/navigation",
  "next/headers",
  "next/server",
  "next/dynamic",
  "tailwindcss",
  "postcss",
  "autoprefixer",
  "typescript",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
  "node:",
]);

function createSanityIssue(
  file: string,
  severity: "error" | "warning",
  message: string,
  category: PreflightIssueCategory,
): SanityIssue {
  return { file, severity, message, category };
}

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

function normalizePackageName(source: string): string {
  if (source.startsWith("@")) {
    const parts = source.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : source;
  }
  if (source.startsWith("node:")) return "node:";
  return source.split("/")[0];
}

function isBuiltinPackage(pkg: string): boolean {
  if (BUILTIN_PACKAGES.has(pkg)) return true;
  for (const builtin of BUILTIN_PACKAGES) {
    if (builtin.endsWith(":")) {
      if (pkg.startsWith(builtin)) return true;
      continue;
    }
    if (pkg.startsWith(`${builtin}/`)) return true;
  }
  return false;
}

function firstMeaningfulLine(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";
}

function unresolvedImportSeverity(): "error" | "warning" {
  const raw = process.env.SAJTMASKIN_SANITY_ALLOW_UNRESOLVED_IMPORT_WARNINGS?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "on") return "warning";
  return "error";
}

function detectSuspiciousPartialFileSnippet(content: string): string | null {
  const firstLine = firstMeaningfulLine(content);
  if (LEADING_CONTINUATION_LINE_RE.test(firstLine)) {
    return "File starts with what looks like a continuation line, not a complete file.";
  }
  if (NESTED_IMPORT_IN_IMPORT_BLOCK_RE.test(content)) {
    return "File contains a nested import inside an unfinished import block.";
  }
  if (DOUBLE_IMPORT_PREFIX_RE.test(content)) {
    return "File starts with overlapping import statements that look like a partial repair snippet.";
  }
  if (MALFORMED_INLINE_NAMED_IMPORT_RE.test(content)) {
    return "File contains a malformed named import that looks like a partial repair snippet.";
  }
  return null;
}

function collectImportedPackages(files: CodeFile[]): Map<string, Set<string>> {
  const imported = new Map<string, Set<string>>();
  for (const file of files) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;
    for (const match of file.content.matchAll(THIRD_PARTY_SOURCE_RE)) {
      const source = match[1];
      if (
        !source ||
        source.startsWith("@/") ||
        source.startsWith("./") ||
        source.startsWith("../") ||
        source.startsWith("~/")
      ) {
        continue;
      }
      const pkg = normalizePackageName(source);
      if (!pkg || isBuiltinPackage(pkg)) continue;
      const importers = imported.get(pkg) ?? new Set<string>();
      importers.add(file.path);
      imported.set(pkg, importers);
    }
  }
  return imported;
}

/**
 * Post-merge sanity checks on the full generated file set.
 * Catches issues that per-file autofix cannot see.
 */
export function runProjectSanityChecks(files: CodeFile[]): SanityResult {
  const importSeverity = unresolvedImportSeverity();
  const importFallbackUsed = importSeverity === "warning";
  const fileMap = new Map<string, CodeFile>();
  for (const f of files) fileMap.set(f.path, f);

  const issues: SanityIssue[] = [];
  const importedPackages = collectImportedPackages(files);

  for (const file of files) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;

    const suspiciousPartialSnippet = detectSuspiciousPartialFileSnippet(file.content);
    if (suspiciousPartialSnippet) {
      issues.push(
        createSanityIssue(
          file.path,
          "error",
          `${suspiciousPartialSnippet} This usually means a repair/generation step returned a file excerpt instead of a complete file.`,
          "code_structure_failure",
        ),
      );
    }

    // 1. Unresolved local imports
    for (const match of file.content.matchAll(IMPORT_RE)) {
      const source = match[1];
      if (!source.startsWith("@/") && !source.startsWith("./") && !source.startsWith("../")) continue;
      if (source.startsWith("@/components/ui/") || source === "@/lib/utils") continue;

      const projectPath = normalizeToProjectPath(source, file.path);
      if (!fileExists(fileMap, projectPath)) {
        issues.push(
          createSanityIssue(
            file.path,
            importSeverity,
            `Unresolved local import: ${source}`,
            "code_structure_failure",
          ),
        );
      }
    }

    // 2. Font usage without import
    if (file.path.includes("layout")) {
      const fontMatch = file.content.match(FONT_USAGE_RE);
      if (fontMatch && !FONT_IMPORT_RE.test(file.content)) {
        issues.push(
          createSanityIssue(
            file.path,
            "error",
            `Font ${fontMatch[1]} is used but not imported from next/font/google`,
            "code_structure_failure",
          ),
        );
      }
    }

    // 2b. Preview-only stripped imports must never leak into saved/exported code
    if (file.content.includes("(stripped for preview compatibility)")) {
      issues.push(
        createSanityIssue(
          file.path,
          "error",
          "Preview-only stripped import leaked into saved project files",
          "code_structure_failure",
        ),
      );
    }

    // 3. Default export check for page/layout files
    if (file.path.match(/\/(page|layout)\.(tsx|jsx)$/)) {
      if (!file.content.includes("export default")) {
        issues.push(
          createSanityIssue(
            file.path,
            "error",
            "Page/layout file is missing a default export",
            "code_structure_failure",
          ),
        );
      }
    }

    // 3b. App Router metadata is not allowed in client components
    if (
      file.path.match(/(^|\/)(page|layout)\.(tsx|jsx)$/) &&
      USE_CLIENT_RE.test(file.content) &&
      METADATA_EXPORT_RE.test(file.content)
    ) {
      issues.push(
        createSanityIssue(
          file.path,
          "error",
          'Client component exports metadata/generateMetadata, which Next.js App Router disallows',
          "code_structure_failure",
        ),
      );
    }
  }

  // 4. globals.css must exist and contain @theme
  const globalsCss = fileMap.get("app/globals.css") ?? fileMap.get("src/app/globals.css");
  if (!globalsCss) {
    issues.push(
      createSanityIssue(
        "app/globals.css",
        "warning",
        "globals.css is missing from generated files",
        "non_blocking_quality_warning",
      ),
    );
  } else if (!globalsCss.content.includes("@theme")) {
    issues.push(
      createSanityIssue(
        globalsCss.path,
        "warning",
        "globals.css does not contain @theme inline color tokens",
        "non_blocking_quality_warning",
      ),
    );
  }

  // 5. layout.tsx must exist
  const layout = fileMap.get("app/layout.tsx") ?? fileMap.get("src/app/layout.tsx");
  if (!layout) {
    issues.push(
      createSanityIssue(
        "app/layout.tsx",
        "warning",
        "layout.tsx is missing from generated files",
        "code_structure_failure",
      ),
    );
  }

  // 6. Known bad peer-dependency pairs in package.json
  const pkgFile = fileMap.get("package.json") ?? fileMap.get("src/package.json");
  if (pkgFile) {
    try {
      const pkgJson = JSON.parse(pkgFile.content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      const deps = pkgJson.dependencies ?? {};
      const declaredPackages = new Set<string>([
        ...Object.keys(pkgJson.dependencies ?? {}),
        ...Object.keys(pkgJson.devDependencies ?? {}),
        ...Object.keys(pkgJson.peerDependencies ?? {}),
        ...Object.keys(pkgJson.optionalDependencies ?? {}),
      ]);

      for (const [pkg, importers] of importedPackages.entries()) {
        if (declaredPackages.has(pkg)) continue;
        const importerPreview = [...importers].slice(0, 3).join(", ");
        issues.push(
          createSanityIssue(
            "package.json",
            "error",
            `Imported third-party package "${pkg}" is used in code but not pinned in package.json (${importerPreview})`,
            "dependency_install_failure",
          ),
        );
      }

      checkKnownBadPeers(deps, issues);
    } catch {
      issues.push(
        createSanityIssue(
          pkgFile.path,
          "error",
          "package.json could not be parsed, so dependency readiness cannot be verified",
          "dependency_install_failure",
        ),
      );
    }
  } else {
    issues.push(
      createSanityIssue(
        "package.json",
        "error",
        "package.json is missing; dependency readiness cannot be verified",
        "dependency_install_failure",
      ),
    );
  }

  // 7. Duplicate route detection
  const routes = new Set<string>();
  for (const file of files) {
    const routeMatch = file.path.match(/^(?:src\/)?app(\/.*)\/(page|layout)\.(tsx|jsx|ts|js)$/);
    if (routeMatch) {
      const route = `${routeMatch[1]}/${routeMatch[2]}`;
      if (routes.has(route)) {
        issues.push(
          createSanityIssue(
            file.path,
            "warning",
            `Duplicate route file: ${route}`,
            "code_structure_failure",
          ),
        );
      }
      routes.add(route);
    }
  }

  // 8. Literal vs dynamic route segment conflict (e.g. product/id/ vs product/[id]/)
  const routeDirs = new Map<string, string[]>();
  for (const file of files) {
    const appMatch = file.path.match(/^(?:src\/)?app\/(.+)\/(page|layout)\.(tsx|jsx|ts|js)$/);
    if (!appMatch) continue;
    const segments = appMatch[1].split("/");
    for (let i = 0; i < segments.length; i++) {
      const parent = segments.slice(0, i).join("/") || ".";
      const segment = segments[i];
      const existing = routeDirs.get(parent) ?? [];
      if (!existing.includes(segment)) existing.push(segment);
      routeDirs.set(parent, existing);
    }
  }
  for (const [parent, segments] of routeDirs) {
    const dynamic = segments.filter((s) => s.startsWith("[") && s.endsWith("]"));
    const literal = segments.filter((s) => !s.startsWith("["));
    for (const dyn of dynamic) {
      const paramName = dyn.slice(1, -1);
      const conflicting = literal.find((lit) => lit === paramName);
      if (conflicting) {
        const literalPath = parent === "." ? conflicting : `${parent}/${conflicting}`;
        issues.push(
          createSanityIssue(
            `app/${literalPath}/`,
            "error",
            `Literal route segment "${conflicting}" conflicts with dynamic segment "${dyn}" under "${parent}". The literal version should be removed.`,
            "code_structure_failure",
          ),
        );
      }
    }
  }

  return {
    issues,
    valid: issues.filter((i) => i.severity === "error").length === 0,
    unresolvedImportFallbackUsed: importFallbackUsed,
  };
}

// ---------------------------------------------------------------------------
// Known bad peer-dependency pairs
// ---------------------------------------------------------------------------

function extractMajor(version: string): number | null {
  const m = version.match(/\d+/);
  return m ? Number.parseInt(m[0], 10) : null;
}

/**
 * Lightweight heuristic checks for version combos that are known to cause
 * `npm install` ERESOLVE failures. Add new rules as they surface in logs.
 */
function checkKnownBadPeers(
  deps: Record<string, string>,
  issues: SanityIssue[],
): void {
  const reactMajor = deps.react ? extractMajor(deps.react) : null;

  // @react-three/fiber <9 requires react <19
  if (deps["@react-three/fiber"] && reactMajor !== null && reactMajor >= 19) {
    const fiberMajor = extractMajor(deps["@react-three/fiber"]);
    if (fiberMajor !== null && fiberMajor < 9) {
      issues.push(
        createSanityIssue(
          "package.json",
          "error",
          `@react-three/fiber ${deps["@react-three/fiber"]} requires react <19 but react is ${deps.react} — use fiber >=9`,
          "dependency_install_failure",
        ),
      );
    }
  }

  // @react-three/drei <10 requires fiber <9
  if (deps["@react-three/drei"] && deps["@react-three/fiber"]) {
    const dreiMajor = extractMajor(deps["@react-three/drei"]);
    const fiberMajor = extractMajor(deps["@react-three/fiber"]);
    if (dreiMajor !== null && dreiMajor < 10 && fiberMajor !== null && fiberMajor >= 9) {
      issues.push(
        createSanityIssue(
          "package.json",
          "error",
          `@react-three/drei ${deps["@react-three/drei"]} is incompatible with fiber ${deps["@react-three/fiber"]} — use drei >=10`,
          "dependency_install_failure",
        ),
      );
    }
  }

  // next 16+ requires react 19+
  if (deps.next && reactMajor !== null) {
    const nextMajor = extractMajor(deps.next);
    if (nextMajor !== null && nextMajor >= 16 && reactMajor < 19) {
      issues.push(
        createSanityIssue(
          "package.json",
          "error",
          `next ${deps.next} requires react >=19 but react is ${deps.react}`,
          "dependency_install_failure",
        ),
      );
    }
  }
}
