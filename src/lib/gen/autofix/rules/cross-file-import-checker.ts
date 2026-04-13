import type { CodeFile } from "@/lib/gen/parser";
import { isRuntimeProvidedImport } from "@/lib/gen/autofix/runtime-imports";

interface CrossFileImportFix {
  sourceFile: string;
  missingImport: string;
  stubFile: string;
}

// Captures: [0]=full statement, [1]=import clause (default+named), [2]=source path
const IMPORT_FULL_RE =
  /import\s+((?:type\s+)?(?:\{[^}]*\}|[\w$]+)(?:\s*,\s*(?:\{[^}]*\}|[\w$]+))*)\s+from\s+['"]([^'"]+)['"]/g;
const NAMED_RE = /\{([^}]+)\}/;
const LOCAL_PREFIXES = ["@/", "./", "../"];
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const INDEX_EXTENSIONS = EXTENSIONS.map((ext) => `/index${ext}`);
const CANDIDATES = [...EXTENSIONS, ...INDEX_EXTENSIONS];

function isLocalImport(source: string): boolean {
  return LOCAL_PREFIXES.some((p) => source.startsWith(p));
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

function fileExists(files: Map<string, CodeFile>, basePath: string): boolean {
  if (files.has(basePath)) return true;
  for (const ext of CANDIDATES) {
    if (files.has(basePath + ext)) return true;
  }
  if (files.has(`src/${basePath}`)) return true;
  for (const ext of CANDIDATES) {
    if (files.has(`src/${basePath}${ext}`)) return true;
  }
  return false;
}

function deriveComponentName(importPath: string): string {
  const segment = importPath.split("/").pop() ?? "Component";
  return segment
    .replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Import-specifier parsing
// ---------------------------------------------------------------------------

interface ImportSpecifiers {
  defaultImport: string | null;
  namedImports: string[];
  isTypeOnly: boolean;
}

function parseImportClause(clause: string): ImportSpecifiers {
  const isTypeOnly = /^type\s/.test(clause.trim());
  const stripped = clause.replace(/^type\s+/, "").trim();

  let defaultImport: string | null = null;
  const namedImports: string[] = [];

  const namedMatch = stripped.match(NAMED_RE);
  if (namedMatch) {
    for (const token of namedMatch[1].split(",")) {
      const clean = token.replace(/\s+as\s+\w+/, "").replace(/type\s+/, "").trim();
      if (clean) namedImports.push(clean);
    }
    const beforeBrace = stripped.slice(0, stripped.indexOf("{")).replace(/,\s*$/, "").trim();
    if (beforeBrace && /^[A-Za-z_$]/.test(beforeBrace)) defaultImport = beforeBrace;
  } else if (/^[A-Za-z_$][\w$]*$/.test(stripped)) {
    defaultImport = stripped;
  }

  return { defaultImport, namedImports, isTypeOnly };
}

// ---------------------------------------------------------------------------
// Stub generation — context-aware per imported name
// ---------------------------------------------------------------------------

function stubForName(name: string): string {
  if (/Provider$/.test(name)) {
    return `export function ${name}({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) {\n  return <>{children}</>;\n}`;
  }
  if (/Context$/.test(name)) {
    return `export const ${name} = React.createContext<unknown>(null);`;
  }
  if (/^use[A-Z]/.test(name)) {
    return `export function ${name}(..._args: unknown[]) {\n  return {};\n}`;
  }
  if (/^[a-z]/.test(name)) {
    return `export function ${name}(..._args: unknown[]) {\n  return null;\n}`;
  }
  return `export function ${name}(props: Record<string, unknown>) {\n  return (\n    <div data-stub="${name}" style={{ padding: "2rem", border: "2px dashed #666", borderRadius: "0.5rem", color: "#999", textAlign: "center", fontSize: "0.875rem" }}>\n      [${name}]\n    </div>\n  );\n}`;
}

function createStubFile(
  importPath: string,
  specifiers: ImportSpecifiers,
  fallbackName: string,
): string {
  if (specifiers.isTypeOnly) {
    return `// Type-only stub for ${importPath}\nexport {};\n`;
  }

  const needsReact =
    specifiers.namedImports.some((n) => /Context$|Provider$/.test(n)) ||
    (specifiers.defaultImport && /Context$|Provider$/.test(specifiers.defaultImport));

  const lines: string[] = [];
  if (needsReact) lines.push(`import * as React from "react";`);
  lines.push("");

  const exportedNames: string[] = [];

  if (specifiers.defaultImport) {
    const name = specifiers.defaultImport;
    lines.push(stubForName(name));
    lines.push(`export default ${name};`);
    exportedNames.push(name);
  }

  for (const name of specifiers.namedImports) {
    if (exportedNames.includes(name)) continue;
    lines.push(stubForName(name));
    exportedNames.push(name);
  }

  if (exportedNames.length === 0) {
    const name = fallbackName;
    lines.push(stubForName(name));
    lines.push(`export default ${name};`);
    lines.push(`export { ${name} };`);
  }

  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main checker
// ---------------------------------------------------------------------------

/**
 * Scans all generated files for local imports whose target does not exist
 * in the file set. For each missing target, generates a stub file that
 * exports exactly the names the importers expect — with context-aware
 * implementations for providers, contexts, hooks, and components.
 */
export function checkCrossFileImports(
  files: CodeFile[],
): { files: CodeFile[]; fixes: CrossFileImportFix[] } {
  const fileMap = new Map<string, CodeFile>();
  for (const f of files) fileMap.set(f.path, f);

  const fixes: CrossFileImportFix[] = [];
  // Accumulate all specifiers per missing target so multi-file imports merge
  const pendingStubs = new Map<
    string,
    { source: string; importers: string[]; specs: ImportSpecifiers[] }
  >();

  for (const file of files) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;

    for (const match of file.content.matchAll(IMPORT_FULL_RE)) {
      const clause = match[1];
      const source = match[2];
      if (!isLocalImport(source)) continue;
      if (isRuntimeProvidedImport(source)) continue;

      const projectPath = normalizeToProjectPath(source, file.path);
      if (fileExists(fileMap, projectPath)) continue;

      const stubPath =
        projectPath.endsWith(".tsx") || projectPath.endsWith(".ts")
          ? projectPath
          : `${projectPath}.tsx`;
      if (fileMap.has(stubPath)) continue;

      const spec = parseImportClause(clause);

      const existing = pendingStubs.get(projectPath);
      if (existing) {
        existing.importers.push(file.path);
        existing.specs.push(spec);
      } else {
        pendingStubs.set(projectPath, {
          source,
          importers: [file.path],
          specs: [spec],
        });
      }
    }
  }

  for (const [projectPath, { source, importers, specs }] of pendingStubs) {
    const stubPath =
      projectPath.endsWith(".tsx") || projectPath.endsWith(".ts")
        ? projectPath
        : `${projectPath}.tsx`;

    // Merge all specifiers from every importer
    const merged: ImportSpecifiers = {
      defaultImport: null,
      namedImports: [],
      isTypeOnly: specs.every((s) => s.isTypeOnly),
    };
    const seenNamed = new Set<string>();
    for (const s of specs) {
      if (s.defaultImport && !merged.defaultImport) merged.defaultImport = s.defaultImport;
      for (const n of s.namedImports) {
        if (!seenNamed.has(n)) {
          seenNamed.add(n);
          merged.namedImports.push(n);
        }
      }
    }

    const fallbackName = deriveComponentName(projectPath);
    const stubContent = createStubFile(source, merged, fallbackName);

    fileMap.set(stubPath, { path: stubPath, content: stubContent, language: "tsx" });

    for (const importer of importers) {
      fixes.push({ sourceFile: importer, missingImport: source, stubFile: stubPath });
    }
  }

  if (fixes.length === 0) return { files, fixes };

  return { files: Array.from(fileMap.values()), fixes };
}
