import type { CodeFile } from "@/lib/gen/parser";
import { isRuntimeProvidedImport } from "@/lib/gen/autofix/runtime-imports";
import ts from "typescript";
import {
  createTsxSourceFile,
  getLocalBindingNamesFromImportDeclaration,
  isDenylistedStubDefaultName,
  removeImportDeclarations,
} from "./import-binding-ast";

interface CrossFileImportFix {
  sourceFile: string;
  missingImport: string;
  stubFile: string;
}

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

interface ImportSpecifiers {
  defaultImport: string | null;
  namedImports: string[];
  isTypeOnly: boolean;
}

function importSpecifiersFromDeclaration(decl: ts.ImportDeclaration): ImportSpecifiers {
  const ic = decl.importClause;
  if (!ic) return { defaultImport: null, namedImports: [], isTypeOnly: false };
  const namedImports: string[] = [];
  if (ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
    for (const el of ic.namedBindings.elements) {
      namedImports.push(el.name.text);
    }
  }
  return {
    defaultImport: ic.name?.text ?? null,
    namedImports,
    isTypeOnly: ic.isTypeOnly,
  };
}

interface ImportDeclMeta {
  decl: ts.ImportDeclaration;
  moduleSpecifier: string;
  resolved: boolean;
  names: string[];
}

function gatherImportMeta(
  decl: ts.ImportDeclaration,
  importerPath: string,
  fileMap: Map<string, CodeFile>,
): ImportDeclMeta {
  const names = getLocalBindingNamesFromImportDeclaration(decl);
  if (!decl.moduleSpecifier || !ts.isStringLiteral(decl.moduleSpecifier)) {
    return { decl, moduleSpecifier: "", resolved: true, names };
  }
  const spec = decl.moduleSpecifier.text;
  if (!isLocalImport(spec) || isRuntimeProvidedImport(spec)) {
    return { decl, moduleSpecifier: spec, resolved: true, names };
  }
  const projectPath = normalizeToProjectPath(spec, importerPath);
  const resolved = fileExists(fileMap, projectPath);
  return { decl, moduleSpecifier: spec, resolved, names };
}

/**
 * Removes local imports whose target file is missing when they duplicate a binding
 * already satisfied by a resolved import (e.g. package `type RapierRigidBody` vs
 * bogus `@/components/rapier-rigid-body`), or when the default import name is denylisted.
 */
function stripCollidingMissingImports(
  content: string,
  importerPath: string,
  fileMap: Map<string, CodeFile>,
): string {
  const sf = createTsxSourceFile(importerPath, content);
  const metas: ImportDeclMeta[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    metas.push(gatherImportMeta(st, importerPath, fileMap));
  }

  const resolvedNames = new Set<string>();
  for (const m of metas) {
    if (m.resolved) {
      for (const n of m.names) resolvedNames.add(n);
    }
  }

  const toRemove = new Set<ts.ImportDeclaration>();
  for (const m of metas) {
    if (m.resolved) continue;
    const ic = m.decl.importClause;
    const defaultName = ic?.name?.text;
    if (defaultName && isDenylistedStubDefaultName(defaultName)) {
      toRemove.add(m.decl);
      continue;
    }
    if (m.names.some((n) => resolvedNames.has(n))) {
      toRemove.add(m.decl);
    }
  }

  if (toRemove.size === 0) return content;
  const next = removeImportDeclarations(sf, toRemove);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
  const out = printer.printFile(next);
  return out.endsWith("\n") || content.endsWith("\n") ? out : `${out}\n`;
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
 *
 * Before stubbing, drops hallucinated local imports that duplicate bindings
 * from resolved imports (AST-accurate, including multiline imports).
 */
export function checkCrossFileImports(
  files: CodeFile[],
): { files: CodeFile[]; fixes: CrossFileImportFix[] } {
  const fileMap = new Map<string, CodeFile>();
  for (const f of files) fileMap.set(f.path, f);

  for (const f of files) {
    if (!f.path.match(/\.(tsx?|jsx?)$/)) continue;
    const nextContent = stripCollidingMissingImports(f.content, f.path, fileMap);
    if (nextContent !== f.content) {
      fileMap.set(f.path, { ...f, content: nextContent });
    }
  }

  const working = Array.from(fileMap.values());
  const fixes: CrossFileImportFix[] = [];
  const pendingStubs = new Map<
    string,
    { source: string; importers: string[]; specs: ImportSpecifiers[] }
  >();

  for (const file of working) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;

    const sf = createTsxSourceFile(file.path, file.content);
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st)) continue;

      const meta = gatherImportMeta(st, file.path, fileMap);
      if (meta.resolved) continue;

      const projectPath = normalizeToProjectPath(meta.moduleSpecifier, file.path);
      const stubPath =
        projectPath.endsWith(".tsx") || projectPath.endsWith(".ts")
          ? projectPath
          : `${projectPath}.tsx`;
      if (fileMap.has(stubPath)) continue;

      const spec = importSpecifiersFromDeclaration(st);
      const source = meta.moduleSpecifier;

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

  // Always return fileMap: strip pass may rewrite files even when no stubs are created.
  return { files: Array.from(fileMap.values()), fixes };
}
