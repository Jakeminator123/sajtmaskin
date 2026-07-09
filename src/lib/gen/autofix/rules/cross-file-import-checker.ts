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
import { FEATURES } from "@/lib/config";

interface CrossFileImportFix {
  sourceFile: string;
  missingImport: string;
  stubFile: string;
  /** Existing project path used instead of creating a null-render stub. */
  rewireTarget?: string;
  /** Import specifier written into `sourceFile` when `rewireTarget` is set. */
  rewireImportSpec?: string;
  /** Set when the missing import matches a dossier `exposes[].import`. */
  dossierId?: string;
  capability?: string;
  /**
   * A7-2 (BUG-SWARM N#1): set when `FEATURES.refuseDossierStubs` is ON and a
   * dossier-exposed import was deliberately NOT stubbed. No `stubFile` is
   * written to the file set, so the unresolved import surfaces downstream as a
   * blocking `code_structure_failure` (runProjectSanityChecks #1) instead of a
   * silent null-render stub. Flag default-OFF → this is never set on master.
   */
  refused?: boolean;
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

function isThreeDImportGap(params: {
  importerPath: string;
  importSource: string;
  projectPath: string;
  content: string;
}): boolean {
  const combined = `${params.importerPath}\n${params.importSource}\n${params.projectPath}\n${params.content}`;
  return /(?:3d|three|webgl|canvas|r3f|react-three|mesh|scene|duck)/i.test(combined);
}

/**
 * Try to find an existing project file that the missing import most likely
 * meant. Returns the existing project path (without extension) when an
 * obvious suffix/prefix sibling exists. Conservative on purpose: we never
 * rewire to a file that is itself a stub fallback or has an unrelated
 * basename root.
 */
interface ModuleExportSurface {
  hasDefault: boolean;
  named: Set<string>;
  /** `export * from "..."` — unknown surface, can't disprove a binding. */
  hasStarReexport: boolean;
}

/**
 * AST scan of a module's export surface: default-export presence, named export
 * identifiers, and whether it re-exports a wildcard. Used by the sibling-rewire
 * guard to verify a rewire target actually provides the binding(s) an importer
 * expects before we point the import at it.
 */
function collectModuleExportSurface(filePath: string, content: string): ModuleExportSurface {
  const sf = createTsxSourceFile(filePath, content);
  const named = new Set<string>();
  let hasDefault = false;
  let hasStarReexport = false;

  for (const st of sf.statements) {
    if (ts.isExportAssignment(st)) {
      // `export default <expr>` (ignore the rare `export = x`).
      if (!st.isExportEquals) hasDefault = true;
      continue;
    }
    if (ts.isExportDeclaration(st)) {
      if (!st.exportClause) {
        hasStarReexport = true;
      } else if (ts.isNamespaceExport(st.exportClause)) {
        named.add(st.exportClause.name.text);
      } else if (ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          if (el.name.text === "default") hasDefault = true;
          else named.add(el.name.text);
        }
      }
      continue;
    }

    const modifiers = ts.canHaveModifiers(st) ? ts.getModifiers(st) : undefined;
    if (!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
      hasDefault = true;
      continue;
    }
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) {
      if (st.name) named.add(st.name.text);
    } else if (ts.isVariableStatement(st)) {
      for (const decl of st.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) named.add(decl.name.text);
      }
    } else if (
      ts.isInterfaceDeclaration(st) ||
      ts.isTypeAliasDeclaration(st) ||
      ts.isEnumDeclaration(st)
    ) {
      named.add(st.name.text);
    }
  }

  return { hasDefault, named, hasStarReexport };
}

/**
 * A rewire is only safe when the candidate sibling actually exports the
 * binding(s) the importer expects: a default import needs a default export and
 * each named import needs a matching named export. A wildcard re-export
 * (`export * from`) is treated as "may provide it" so a valid barrel rewire is
 * not blocked. This prevents silently mounting an unrelated sibling (e.g. a
 * `-context` provider) in place of the intended component.
 */
function rewireTargetSatisfiesImport(
  surface: ModuleExportSurface,
  specifiers: ImportSpecifiers,
): boolean {
  if (surface.hasStarReexport) return true;
  if (specifiers.defaultImport && !surface.hasDefault) return false;
  for (const name of specifiers.namedImports) {
    if (!surface.named.has(name)) return false;
  }
  return true;
}

function findRewireTarget(
  missingProjectPath: string,
  fileMap: Map<string, CodeFile>,
  requiredSpecifiers: ImportSpecifiers,
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
    const candidates: Array<{ key: string; resolved: string }> = [];
    if (fileMap.has(root)) candidates.push({ key: root, resolved: root.replace(/\.(tsx|ts|jsx|js)$/, "") });
    for (const ext of EXTENSIONS) {
      if (fileMap.has(root + ext)) candidates.push({ key: root + ext, resolved: root });
    }
    for (const indexExt of INDEX_EXTENSIONS) {
      if (fileMap.has(root + indexExt)) candidates.push({ key: root + indexExt, resolved: root });
    }
    for (const candidate of candidates) {
      const file = fileMap.get(candidate.key);
      if (!file) continue;
      // Wrong-sibling-rewire guard (P7): only accept a sibling that actually
      // exports the imported binding(s); otherwise fall through so the import
      // is stubbed (a visible placeholder) rather than silently mounting an
      // unrelated component.
      const surface = collectModuleExportSurface(candidate.key, file.content);
      if (rewireTargetSatisfiesImport(surface, requiredSpecifiers)) {
        return candidate.resolved;
      }
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
  importerPath: string,
): string | null {
  if (originalSpec.startsWith("@/")) {
    const cleaned = resolvedProjectPath.replace(/^src\//, "");
    return `@/${cleaned}`;
  }
  if (originalSpec.startsWith("./") || originalSpec.startsWith("../")) {
    const importerDir = importerPath.includes("/")
      ? importerPath.slice(0, importerPath.lastIndexOf("/"))
      : "";
    const fromParts = importerDir.split("/").filter(Boolean);
    const toParts = resolvedProjectPath.split("/").filter(Boolean);
    while (fromParts.length > 0 && toParts.length > 0 && fromParts[0] === toParts[0]) {
      fromParts.shift();
      toParts.shift();
    }
    const relativeParts = [...fromParts.map(() => ".."), ...toParts];
    const relative = relativeParts.join("/");
    if (!relative) return null;
    return relative.startsWith("..") ? relative : `./${relative}`;
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
      // Record the module export name, not the local binding. For an aliased
      // import (`import { PricingTable as PT }`) the sibling must export
      // `PricingTable`, so the rewire-satisfies check and stub generation both
      // need `propertyName`; using `el.name` (= `PT`) wrongly rejects a valid
      // sibling and falls back to auto-stubbing.
      namedImports.push((el.propertyName ?? el.name).text);
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
 * bogus `@/components/rapier-rigid-body`). Local imports whose DEFAULT name is
 * denylisted (JS globals, DOM types, runtime classes — see
 * `isDenylistedStubDefaultName`) are removed regardless of whether the target
 * file exists, since such a binding always shadows the real global.
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
    // Denylisted default-import names (JS/Web globals, DOM types, runtime
    // classes, single-letter generics) are stripped from LOCAL imports even
    // when the target file EXISTS: a local "component" named after a JS
    // global is never legitimate, and when the LLM co-emits the stub file
    // (`components/uint8-array.tsx` + the import) the import resolves,
    // survives Normalize, and shadows the global — a build-breaking collision
    // the F2 gate now blocks with no mechanical repair path. Package imports
    // (`import Image from "next/image"`, `import Error from "next/error"`)
    // are never touched — the guard applies to local specifiers only.
    const ic = m.decl.importClause;
    const defaultName = ic?.name?.text;
    if (
      defaultName &&
      isLocalImport(m.moduleSpecifier) &&
      isDenylistedStubDefaultName(defaultName)
    ) {
      // A RESOLVED local import whose default name is actually rendered as a
      // JSX element in this file is a real component that happens to share a
      // global's name (e.g. a custom <Error /> boundary at
      // `@/components/error`). Stripping it would leave the JSX referencing
      // the JS global instead (Bugbot on #481). Only strip when the name is
      // never used as JSX here — the incident class (`Uint8Array` in
      // `new ReadableStream<Uint8Array>`) is plain identifier/generic usage.
      // The lookbehind excludes generic positions (`Foo<Name>`): same anchor
      // as jsx-checker's extractUsedComponents.
      const jsxUsageRe = new RegExp(
        `(?<![A-Za-z0-9_$.])<${defaultName.replace(/\$/g, "\\$")}[\\s/>]`,
      );
      const usedAsJsx = m.resolved && jsxUsageRe.test(content);
      if (!usedAsJsx) {
        toRemove.add(m.decl);
        continue;
      }
    }
    if (m.resolved) continue;
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

/**
 * Visible degraded-placeholder body for an auto-stubbed PascalCase component.
 *
 * P7 (fix/autofix-fidelity-guards): the previous fallback returned `null`,
 * which hid a missing/auto-stubbed component as a blank gap the user mistook
 * for an intentional empty design — a silent fidelity loss. We now render a
 * small, clearly self-labeled placeholder so the degradation is VISIBLE in the
 * preview instead of looking finished. It uses inline styles (no Tailwind/CSS
 * dependency), renders no children or hooks (safe as a server OR client
 * component), and keeps the `autofix-stub:` grep marker. If the model's own
 * file arrives in a later merge pass it still wins over this placeholder.
 */
function visibleStubComponentBody(name: string): string {
  return [
    `  // autofix-stub:${name} — model did not emit a real implementation.`,
    `  // P7: render a VISIBLE degraded placeholder instead of a silent \`return null\`.`,
    `  return (`,
    `    <span`,
    `      role="status"`,
    `      data-autofix-stub="${name}"`,
    `      style={{`,
    `        display: "inline-flex",`,
    `        alignItems: "center",`,
    `        gap: "0.4rem",`,
    `        padding: "0.4rem 0.7rem",`,
    `        margin: "0.25rem 0",`,
    `        borderRadius: "0.5rem",`,
    `        border: "1px dashed rgba(148,163,184,0.7)",`,
    `        background: "rgba(148,163,184,0.12)",`,
    `        color: "rgb(100,116,139)",`,
    `        font: "500 0.8125rem/1.4 system-ui,-apple-system,sans-serif",`,
    `      }}`,
    `    >`,
    `      Platshållare för ${name} (komponenten kunde inte genereras)`,
    `    </span>`,
    `  );`,
  ].join("\n");
}

function stubForName(name: string, allowJsx: boolean): string {
  if (/Provider$/.test(name)) {
    // A passthrough provider renders its children. On a non-`.tsx` stub target
    // (e.g. an explicit `.ts` import) JSX would be a syntax error, so emit the
    // non-JSX `React.createElement(React.Fragment, …)` equivalent instead.
    if (!allowJsx) {
      return `export function ${name}({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) {\n  return React.createElement(React.Fragment, null, children);\n}`;
    }
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
  // PascalCase fallback — assumed to be a React component.
  if (!allowJsx) {
    // Non-`.tsx` stub target (e.g. an explicit `.ts` import): JSX would be a
    // syntax error here, so keep the inert null-render shape. Still grep-able
    // via `autofix-stub:`.
    return `export function ${name}(_props: Record<string, unknown>) {\n  // autofix-stub:${name} — model did not emit a real implementation; rendering nothing (non-tsx stub target).\n  return null;\n}`;
  }
  return `export function ${name}(_props: Record<string, unknown>) {\n${visibleStubComponentBody(name)}\n}`;
}

function createStubFile(
  importPath: string,
  specifiers: ImportSpecifiers,
  fallbackName: string,
  allowJsx: boolean,
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
    lines.push(stubForName(name, allowJsx));
    lines.push(`export default ${name};`);
    exportedNames.push(name);
  }

  for (const name of specifiers.namedImports) {
    if (exportedNames.includes(name)) continue;
    lines.push(stubForName(name, allowJsx));
    exportedNames.push(name);
  }

  if (exportedNames.length === 0) {
    const name = fallbackName;
    lines.push(stubForName(name, allowJsx));
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
  selectedDossierIds?: readonly string[],
): { files: CodeFile[]; fixes: CrossFileImportFix[] } {
  const fileMap = new Map<string, CodeFile>();
  for (const f of files) fileMap.set(f.path, f);
  // B05: scope the refuseDossierStubs gate to dossiers actually selected for
  // this generation. Without this, getDossierExposesByImportPath matches the
  // WHOLE dossier registry, so an unresolved import owned by a dossier that was
  // never selected would still be refused — blocking legitimate builds
  // (false-RED) when the flag is ON in prod. When the selected set is unknown
  // (undefined/empty) we never refuse, preserving the silent-stub behavior.
  const selectedDossierIdSet = new Set(selectedDossierIds ?? []);

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

      const spec = importSpecifiersFromDeclaration(st);

      // Prefer an obvious sibling import over a null-render stub.
      // Example: `@/components/three-canvas` can mean the existing
      // `@/components/three-canvas-shell`. The rewire only fires when the
      // sibling actually exports the imported binding(s) (see findRewireTarget
      // wrong-sibling guard) so we never silently mount an unrelated module.
      const rewireResolved = findRewireTarget(projectPath, fileMap, spec);
      const rewireSpec =
        rewireResolved !== null
          ? projectPathToImportSpec(rewireResolved, meta.moduleSpecifier, file.path)
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
            stubFile: rewireResolved,
            rewireTarget: rewireResolved,
            rewireImportSpec: rewireSpec,
          });
          continue;
        }
      }

      const source = meta.moduleSpecifier;
      if (
        isThreeDImportGap({
          importerPath: file.path,
          importSource: source,
          projectPath,
          content: file.content,
        })
      ) {
        fixes.push({
          sourceFile: file.path,
          missingImport: source,
          stubFile: stubPath,
          capability: "visual-3d",
        });
        continue;
      }

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
    const dossierMatch = getDossierExposesByImportPath(source);

    // A7-2 / grandmaster område 7 (BUG-SWARM N#1; see
    // docs/plans/avklarat/grandmaster/aktiviteter/A7-2-refuse-dossier-stubs-flag.md):
    // when FEATURES.refuseDossierStubs is ON, refuse to fabricate a silent
    // null-render stub for a dossier-exposed import. We skip stub creation, so
    // the still-unresolved import is caught downstream by runProjectSanityChecks
    // (#1 "Unresolved local import" → error / code_structure_failure) and the
    // version degrades/blocks instead of shipping false-green hollow output.
    // The refusal is recorded as a `refused` fix for observability. This is the
    // loud-error path the earlier TODO described. Default-OFF → the silent-stub
    // branch below runs exactly as on master. B05: only refuse when the matched
    // dossier was actually selected for this generation (else it's an unrelated
    // registry path and refusing would be a false-RED).
    if (
      dossierMatch &&
      FEATURES.refuseDossierStubs &&
      selectedDossierIdSet.has(dossierMatch.dossierId)
    ) {
      console.warn(
        `[cross-file-import-checker] dossier_exposed_path refused: import "${source}" ` +
          `from dossier "${dossierMatch.dossierId}" (capability: ${dossierMatch.capability}) ` +
          `was not emitted by the LLM. Stub creation was refused ` +
          `(FEATURES.refuseDossierStubs); the unresolved import will degrade/block ` +
          `the version instead of shipping a silent null-render stub.`,
      );
      for (const importer of importers) {
        fixes.push({
          sourceFile: importer,
          missingImport: source,
          stubFile: stubPath,
          dossierId: dossierMatch.dossierId,
          capability: dossierMatch.capability,
          refused: true,
        });
      }
      continue;
    }

    // Only the `.tsx` stub target can hold JSX; a `.ts` target keeps the
    // inert null-render shape (see `stubForName`).
    const stubContent = createStubFile(source, merged, fallbackName, stubPath.endsWith(".tsx"));

    // Check whether this missing import is a dossier-exposed path. If so,
    // log a warning for observability — the LLM should have emitted the real
    // file, or imported from the correct dossier path. We still create the
    // stub (pipeline must not break), but the warning signals a dossier gap.
    // The flag-gated refusal above is the loud alternative; with the flag OFF
    // (master default) this silent-stub branch is preserved verbatim.
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
