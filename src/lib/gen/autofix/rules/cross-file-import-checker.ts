import type { CodeFile } from "@/lib/gen/parser";
import { isRuntimeProvidedImport } from "@/lib/gen/autofix/runtime-imports";
import ts from "typescript";
import {
  createTsxSourceFile,
  getLocalBindingNamesFromImportDeclaration,
  isDenylistedStubDefaultName,
  removeImportDeclarations,
} from "./import-binding-ast";
import { getDossierExposesByImportPath } from "@/lib/gen/dossiers/registry";

interface CrossFileImportFix {
  sourceFile: string;
  missingImport: string;
  stubFile: string;
  /** Existing project path used instead of creating a null-render stub. */
  rewireTarget?: string;
  /** Set when the missing import matches a dossier `exposes[].import`. */
  dossierId?: string;
  capability?: string;
}

const LOCAL_PREFIXES = ["@/", "./", "../"];
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const INDEX_EXTENSIONS = EXTENSIONS.map((ext) => `/index${ext}`);
const CANDIDATES = [...EXTENSIONS, ...INDEX_EXTENSIONS];

/**
 * Common suffix/prefix variants the LLM frequently mixes up when emitting
 * imports. Order matters slightly: longer suffixes first so we don't
 * accidentally match `-canvas` inside `-canvas-shell`.
 */
const REWIRE_SUFFIX_VARIANTS = [
  "-canvas-shell",
  "-canvas",
  "-shell",
  "-component",
  "-wrapper",
  "-container",
  "-provider",
  "-context",
  "-overlay",
  "-scene",
  "-runtime",
] as const;

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

/**
 * Try to find an existing project file that the missing import most likely
 * meant. Returns the existing project path (without extension) when an
 * obvious suffix/prefix sibling exists. Conservative on purpose: we never
 * rewire to a file that is itself a stub fallback or has an unrelated
 * basename root.
 */
function findRewireTarget(
  missingProjectPath: string,
  fileMap: Map<string, CodeFile>,
): string | null {
  const lastSlash = missingProjectPath.lastIndexOf("/");
  const dir = lastSlash >= 0 ? missingProjectPath.slice(0, lastSlash) : "";
  const basename = lastSlash >= 0 ? missingProjectPath.slice(lastSlash + 1) : missingProjectPath;
  if (!basename) return null;

  const candidateBases = new Set<string>();

  // 1. The model imported the "core" name; the real file has a suffix.
  for (const suffix of REWIRE_SUFFIX_VARIANTS) {
    candidateBases.add(`${basename}${suffix}`);
  }
  // 2. The model imported a suffixed name; the real file is unsuffixed.
  for (const suffix of REWIRE_SUFFIX_VARIANTS) {
    if (basename.endsWith(suffix) && basename.length > suffix.length) {
      candidateBases.add(basename.slice(0, -suffix.length));
    }
  }

  const tryProbe = (probedDir: string, probedBase: string): string | null => {
    const root = probedDir ? `${probedDir}/${probedBase}` : probedBase;
    if (fileMap.has(root)) return root.replace(/\.(tsx|ts|jsx|js)$/, "");
    for (const ext of EXTENSIONS) {
      if (fileMap.has(root + ext)) return root;
    }
    for (const indexExt of INDEX_EXTENSIONS) {
      if (fileMap.has(root + indexExt)) return root;
    }
    return null;
  };

  for (const candidateBase of candidateBases) {
    const direct = tryProbe(dir, candidateBase);
    if (direct) return direct;
    // Some scaffolds live under `src/` — probe the mirrored path too.
    const srcDir = dir.startsWith("src/") ? dir : `src/${dir}`.replace(/\/$/, "");
    const mirrored = tryProbe(srcDir, candidateBase);
    if (mirrored) return mirrored;
  }
  return null;
}

/**
 * Convert a resolved project path back to an import specifier in the same
 * style the importer used. Preserves `@/` aliases and falls back to leaving
 * the path as-is when the source spec was relative — relative-import rewire
 * is intentionally not handled here to keep the change minimal.
 */
function projectPathToImportSpec(
  resolvedProjectPath: string,
  originalSpec: string,
): string | null {
  if (originalSpec.startsWith("@/")) {
    const cleaned = resolvedProjectPath.replace(/^src\//, "");
    return `@/${cleaned}`;
  }
  return null;
}

/**
 * Replace `from "<oldSpec>"` (and side-effect `import "<oldSpec>"`) with
 * `<newSpec>` while preserving the original quote style. The pattern is
 * scoped to import statements only.
 */
function rewireImportSpecInSource(
  content: string,
  oldSpec: string,
  newSpec: string,
): string {
  const escaped = oldSpec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fromPattern = new RegExp(`(\\bfrom\\s+['"])${escaped}(['"])`, "g");
  const sideEffectPattern = new RegExp(`(\\bimport\\s+['"])${escaped}(['"])`, "g");
  return content
    .replace(fromPattern, `$1${newSpec}$2`)
    .replace(sideEffectPattern, `$1${newSpec}$2`);
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
  // PascalCase fallback — assumed to be a React component. Returns null so the
  // preview never shows a visible dashed "[Name]" placeholder box that the user
  // mistakes for a broken design. The stub still satisfies the import resolver
  // + TypeScript binding; if the model's own file arrives in a later merge
  // pass it can win over this placeholder. Grep for `autofix-stub:` to locate.
  return `export function ${name}(_props: Record<string, unknown>) {\n  // autofix-stub:${name} — model did not emit a real implementation; rendering nothing.\n  return null;\n}`;
}

function createStubFile(
  importPath: string,
  specifiers: ImportSpecifiers,
  fallbackName: string,
): string {
  const semanticHelper = createSemanticMissingComponentHelper(importPath, specifiers);
  if (semanticHelper) return semanticHelper;

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

function uniqueExportNames(specifiers: ImportSpecifiers, fallbackName: string): string[] {
  const names = new Set<string>();
  for (const name of specifiers.namedImports) {
    if (/^[A-Z_$a-z][\w$]*$/.test(name)) names.add(name);
  }
  if (names.size === 0 && !specifiers.defaultImport) names.add(fallbackName);
  return [...names];
}

/**
 * Minimal real helpers for common hallucinated `@/components/*` imports.
 *
 * These are intentionally not null-render stubs: they provide visible,
 * harmless UI for generic helper imports the model often assumes exist
 * (`@/components/icon`, `@/components/date`). This keeps canonical
 * output runnable without hiding missing visuals behind empty placeholders.
 */
function createSemanticMissingComponentHelper(
  importPath: string,
  specifiers: ImportSpecifiers,
): string | null {
  const normalized = importPath.replace(/\\/g, "/");
  if (normalized === "@/components/icon") {
    const namedExports = uniqueExportNames(specifiers, "Icon").filter((name) => name !== "Icon");
    const extraExports = namedExports
      .map(
        (name) => `export function ${name}(props: IconProps) {
  return <Icon {...props} name={props.name ?? "${name}"} />;
}`,
      )
      .join("\n\n");
    return `"use client";

import {
  Activity,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  HelpCircle,
  LineChart,
  Search,
  Sparkles,
  Star,
  User,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  arrow: ArrowRight,
  arrowright: ArrowRight,
  barchart: BarChart3,
  barchart3: BarChart3,
  calendar: Calendar,
  check: CheckCircle2,
  clock: Clock,
  creditcard: CreditCard,
  date: Calendar,
  default: Sparkles,
  help: HelpCircle,
  linechart: LineChart,
  search: Search,
  sparkles: Sparkles,
  star: Star,
  user: User,
};

export interface IconProps {
  name?: string;
  className?: string;
  size?: number;
  "aria-hidden"?: boolean;
}

export function Icon({ name = "default", className, size = 20, ...props }: IconProps) {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const Component = ICONS[key] ?? ICONS.default;
  return <Component className={className} size={size} aria-hidden={props["aria-hidden"] ?? true} />;
}

${extraExports ? `${extraExports}\n\n` : ""}export default Icon;
`;
  }

  if (normalized === "@/components/date") {
    const namedExports = uniqueExportNames(specifiers, "DateDisplay").filter(
      (name) => name !== "DateDisplay",
    );
    const extraExports = namedExports
      .map(
        (name) => `export function ${name}(props: DateDisplayProps) {
  return <DateDisplay {...props} />;
}`,
      )
      .join("\n\n");
    return `"use client";

export type DateLike = Date | string | number | null | undefined;

export interface DateDisplayProps {
  value?: DateLike;
  date?: DateLike;
  label?: string;
  className?: string;
}

function formatDate(value: DateLike): string {
  if (value === null || value === undefined || value === "") return "Välj datum";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function toDateTime(value: DateLike): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function DateDisplay({ value, date, label, className }: DateDisplayProps) {
  const resolvedValue = value ?? date;
  return (
    <time className={className} dateTime={toDateTime(resolvedValue)}>
      {label ? label + ": " : ""}
      {formatDate(resolvedValue)}
    </time>
  );
}

${extraExports ? `${extraExports}\n\n` : ""}export default DateDisplay;
`;
  }

  return null;
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
    let rewiredContent: string | null = null;
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

      // Prefer an obvious sibling import over a null-render stub.
      // Example: `@/components/three-canvas` can mean the existing
      // `@/components/three-canvas-shell`.
      const rewireResolved = findRewireTarget(projectPath, fileMap);
      const rewireSpec =
        rewireResolved !== null
          ? projectPathToImportSpec(rewireResolved, meta.moduleSpecifier)
          : null;
      if (rewireResolved && rewireSpec) {
        const baseContent: string = rewiredContent ?? file.content;
        const nextContent = rewireImportSpecInSource(
          baseContent,
          meta.moduleSpecifier,
          rewireSpec,
        );
        if (nextContent !== baseContent) {
          rewiredContent = nextContent;
          fixes.push({
            sourceFile: file.path,
            missingImport: meta.moduleSpecifier,
            stubFile: rewireSpec,
            rewireTarget: rewireResolved,
          });
          continue;
        }
      }

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
    if (rewiredContent !== null) {
      const updated = fileMap.get(file.path);
      if (updated) {
        fileMap.set(file.path, { ...updated, content: rewiredContent });
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

    // Check whether this missing import is a dossier-exposed path. If so,
    // log a warning for observability — the LLM should have emitted the real
    // file, or imported from the correct dossier path. We still create the
    // stub (pipeline must not break), but the warning signals a dossier gap.
    // TODO(P5+ wave): gate stub creation behind FEATURES.refuseDossierStubs
    // and throw a loud error instead of creating a silent null-render stub.
    const dossierMatch = getDossierExposesByImportPath(source);
    if (dossierMatch) {
      console.warn(
        `[cross-file-import-checker] dossier_exposed_path stubbed: import "${source}" ` +
          `from dossier "${dossierMatch.dossierId}" (capability: ${dossierMatch.capability}) ` +
          `was not emitted by the LLM. A null-render stub was created at ${stubPath}. ` +
          `This is likely a dossier integration gap.`,
      );
    }

    fileMap.set(stubPath, { path: stubPath, content: stubContent, language: "tsx" });

    for (const importer of importers) {
      fixes.push({
        sourceFile: importer,
        missingImport: source,
        stubFile: stubPath,
        ...(dossierMatch
          ? { dossierId: dossierMatch.dossierId, capability: dossierMatch.capability }
          : {}),
      });
    }
  }

  // Always return fileMap: strip pass may rewrite files even when no stubs are created.
  return { files: Array.from(fileMap.values()), fixes };
}
