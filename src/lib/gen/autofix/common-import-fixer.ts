import type { CodeFile } from "@/lib/gen/parser";
import { normalizeFilePath, resolveLocalImportPath } from "@/lib/gen/preview/utils";

type ExportIndex = Map<string, string[]>;
type ModuleExportIndex = Map<string, { named: Set<string>; hasDefault: boolean; defaultName: string | null }>;

const NAMED_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g;
const DEFAULT_IMPORT_RE = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];?/g;
const LOCAL_DEFAULT_IMPORT_LINE_RE =
  /^(\s*import\s+)([A-Za-z_$][\w$]*)(\s*,\s*\{([^}]*)\})?\s+from\s+["']([^"']+)["'];?/gm;
const LOCAL_NAMED_IMPORT_LINE_RE =
  /^(\s*import\s+)(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/gm;
const TYPE_IMPORT_RE = /import\s+type\s+\{([^}]+)\}\s+from\s+["']react["'];?/;
const REACT_IMPORT_RE = /import\s+\{([^}]+)\}\s+from\s+["']react["'];?/;
const USE_CLIENT_DIRECTIVE_RE = /^["']use client["'];?\s*\n/;
const NEXT_IMAGE_IMPORT_RE = /import\s+Image\s+from\s+["']next\/image["'];?/;
const IMAGE_USAGE_RE = /<Image\b[^>]*\b(?:src|fill)\b/;
const NEXT_OG_IMAGE_RESPONSE_IMPORT_RE = /import\s+\{([^}]*)\bImageResponse\b([^}]*)\}\s+from\s+["']next\/og["'];?/;
const IMAGE_RESPONSE_USAGE_RE = /\bnew\s+ImageResponse\s*\(/;
const LOCAL_DECL_RE =
  /\b(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)\b/g;
const FUNCTION_PARAM_RE =
  /\(\s*\{\s*([^}]*)\}\s*:\s*\{[^}]*\}\s*\)|\(\s*([A-Za-z_$][\w$]*)\s*:\s*[^)]*\)/g;
const EXPORT_DECL_RE =
  /\bexport\s+(?:const|let|var|function|async\s+function|class|enum|type|interface)\s+([A-Za-z_$][\w$]*)\b/g;
const EXPORT_LIST_RE = /\bexport\s*\{([^}]+)\}/g;
const DEFAULT_FUNCTION_EXPORT_RE = /\bexport\s+default\s+(?:async\s+)?function(?:\s+([A-Za-z_$][\w$]*))?/g;
const DEFAULT_CLASS_EXPORT_RE = /\bexport\s+default\s+class(?:\s+([A-Za-z_$][\w$]*))?/g;
const DEFAULT_IDENTIFIER_EXPORT_RE = /\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;/g;

const BASELINE_EXPORTS: Array<{ symbol: string; importPath: string }> = [
  { symbol: "useReducedMotion", importPath: "@/hooks/use-reduced-motion" },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** First top-level binding site for a name (function, class, const, interface, …). */
function findFirstLocalBindingDeclarationIndex(code: string, name: string): number | null {
  const escaped = escapeRegExp(name);
  const patterns = [
    new RegExp(`\\bfunction\\s+${escaped}\\b`),
    new RegExp(`\\bclass\\s+${escaped}\\b`),
    new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\b`),
    new RegExp(`\\b(?:interface|type|enum)\\s+${escaped}\\b`),
  ];
  let best: number | null = null;
  for (const re of patterns) {
    const m = re.exec(code);
    if (m && m.index !== undefined) {
      if (best === null || m.index < best) best = m.index;
    }
  }
  return best;
}

/**
 * True when the file carries a local VALUE declaration of `name`
 * (function/class/const/let/var/enum — the declarations that can serve value
 * usages after a conflicting import is removed). Interface/type declarations
 * are deliberately excluded: dropping a value-used import in favour of a
 * local type would trade TS2440 for TS2304 (that sub-case is owned by
 * `fixDuplicateImportAndLocalTypeCollision`, which checks value usage).
 */
function hasLocalValueDeclaration(code: string, name: string): boolean {
  const escaped = escapeRegExp(name);
  return new RegExp(
    `\\b(?:function|class|const|let|var|enum)\\s+${escaped}\\b`,
  ).test(code);
}

/** e.g. `function X({ foo: bar }` — local name is `bar`. */
function findFirstDestructuredAliasBindingIndex(code: string, localName: string): number | null {
  const escaped = escapeRegExp(localName);
  const re = new RegExp(`\\b[A-Za-z_$][\\w$]*\\s*:\\s*${escaped}\\b`);
  const m = re.exec(code);
  return m ? m.index : null;
}

function findFirstShadowingIndex(code: string, name: string): number | null {
  const candidates = [
    findFirstLocalBindingDeclarationIndex(code, name),
    findFirstDestructuredAliasBindingIndex(code, name),
  ].filter((x): x is number => x !== null);
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

/**
 * Drop an import binding only when it truly shadows a local declaration later in the file
 * and the imported name is not used between the end of the import and that declaration.
 *
 * `confirmedConflicts` (compiler-confirmed TS2440 names from the diagnostic
 * message) relaxes the heuristic guards: the compiler has already proven the
 * import and a local declaration collide, so the import binding is unusable —
 * every reference must resolve against the local declaration. The only check
 * kept is that a local VALUE declaration actually exists in the current
 * content (the diagnostic may be stale, and a local *type* declaration can
 * not serve value usages — that sub-case stays with the type-collision
 * fixer / the LLM).
 */
/**
 * End offset for a patch that removes a whole import statement.
 *
 * The statement's own line break is not part of the match, so `replacement: ""`
 * alone turns the line into a BLANK one instead of removing it. That is not
 * cosmetic: a fixer upstream can re-add the same import next pass, and the
 * add/remove cycle then stacks one blank line per pass forever (prod chat
 * f98fd5c0 went 7 -> 9 -> 21 -> 17 blank lines above the imports in every
 * `components/ui/*` file, growing with each generation). Consume the trailing
 * newline so a removed line actually disappears.
 */
function endOfRemovedImportLine(code: string, importEnd: number): number {
  let idx = importEnd;
  while (idx < code.length && (code[idx] === " " || code[idx] === "\t")) idx += 1;
  if (code[idx] === "\r") idx += 1;
  if (code[idx] === "\n") return idx + 1;
  return importEnd;
}

function shouldDropConflictingImportBinding(
  code: string,
  declarations: Set<string>,
  bindingLocal: string,
  importStatementEnd: number,
  confirmedConflicts?: ReadonlySet<string>,
): boolean {
  if (confirmedConflicts?.has(bindingLocal)) {
    return hasLocalValueDeclaration(code, bindingLocal);
  }
  if (!declarations.has(bindingLocal)) return false;
  const shadowIdx = findFirstShadowingIndex(code, bindingLocal);
  if (shadowIdx === null) return false;
  if (shadowIdx <= importStatementEnd) return false;
  const gap = code.slice(importStatementEnd, shadowIdx);
  if (new RegExp(`\\b${escapeRegExp(bindingLocal)}\\b`).test(gap)) {
    return false;
  }
  return true;
}

function findLastImportIndex(lines: string[]): number {
  let last = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*import\s/.test(lines[index])) last = index;
  }
  return last;
}

export function insertImportAfterDirectives(code: string, importLine: string): string {
  const directiveMatch = USE_CLIENT_DIRECTIVE_RE.exec(code);
  if (directiveMatch) {
    const end = directiveMatch[0].length;
    return `${code.slice(0, end)}${importLine}\n${code.slice(end)}`;
  }

  const lines = code.split("\n");
  const lastImportIndex = findLastImportIndex(lines);
  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, importLine);
    return lines.join("\n");
  }

  return `${importLine}\n${code}`;
}

function parseImportNames(specifiers: string): string[] {
  return specifiers
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const aliasParts = part.split(/\s+as\s+/i);
      return aliasParts[aliasParts.length - 1]!.replace(/^type\s+/, "").trim();
    })
    .filter(Boolean);
}

type NamedImportSpecifier = {
  raw: string;
  imported: string;
  local: string;
};

function parseNamedImportSpecifiersDetailed(specifiers: string): NamedImportSpecifier[] {
  const parsed: NamedImportSpecifier[] = [];
  for (const part of specifiers.split(",")) {
    const raw = part.trim();
    if (!raw) continue;
    const cleaned = raw.replace(/^type\s+/, "").trim();
    const aliasParts = cleaned.split(/\s+as\s+/i).map((segment) => segment.trim());
    const imported = aliasParts[0] ?? "";
    const local = aliasParts[aliasParts.length - 1] ?? "";
    if (!imported || !local) continue;
    parsed.push({ raw, imported, local });
  }
  return parsed;
}

function formatNamedImportSpecifier(spec: NamedImportSpecifier): string {
  return spec.imported === spec.local ? spec.imported : `${spec.imported} as ${spec.local}`;
}

function extractImportedNames(code: string): Set<string> {
  const names = new Set<string>();

  for (const match of code.matchAll(NAMED_IMPORT_RE)) {
    for (const name of parseImportNames(match[1])) {
      names.add(name);
    }
  }
  for (const match of code.matchAll(DEFAULT_IMPORT_RE)) {
    names.add(match[1]);
  }

  return names;
}

function extractLocalDeclarations(code: string): Set<string> {
  const names = new Set<string>();
  for (const match of code.matchAll(LOCAL_DECL_RE)) {
    names.add(match[1]);
  }
  for (const match of code.matchAll(FUNCTION_PARAM_RE)) {
    const objectKeys = match[1];
    const singleParam = match[2];
    if (singleParam) names.add(singleParam);
    if (objectKeys) {
      for (const raw of objectKeys.split(",")) {
        let segment = raw.trim();
        if (!segment) continue;
        if (segment.startsWith("...")) {
          const rest = segment.slice(3).trim().replace(/\?.*$/, "").trim();
          if (rest) names.add(rest);
          continue;
        }
        // Object parameter destructuring: "{ foo: bar = 1, baz }"
        // should register local bindings "bar" and "baz" (not source key "foo").
        const alias = segment.includes(":") ? segment.split(":")[1] : segment;
        segment = (alias ?? segment).trim();
        segment = segment.split("=")[0]?.trim() ?? "";
        segment = segment.replace(/\?.*$/, "").trim();
        if (segment) names.add(segment);
      }
    }
  }
  return names;
}

/**
 * Symbols we accept into the export index.
 *
 * SAJ-61 broadened this from "ALL_CAPS | camelCase | strict-PascalCase" to
 * "any valid TS/JS identifier" because the strict PascalCase regex
 * (`[A-Z][a-z][A-Za-z0-9]*`) excluded:
 *   - acronym-PascalCase like `APIBanner`, `HTTPStatusCard`,
 *     `URLProvider` (`[A-Z][A-Z]…`)
 *   - single-letter exports like `X`, `Y` (3D scene primitives)
 *
 * False positives are still bounded:
 *   - the file-level filter (`isIndexableSharedFile`) keeps `app/`,
 *     `components/ui/`, `node_modules/`, autofix stubs out
 *   - `fixMissingLocalSymbolImports` only auto-imports when **exactly one**
 *     indexable file exports the symbol — multiple kandidater are left
 *     for the structured repair-loop, never auto-guessed
 *   - `symbolLooksUsed` requires the symbol to actually appear as a
 *     value/type reference in the importing file
 */
function isEligibleSharedSymbol(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

/**
 * Files whose named exports we index for the auto-import path
 * (`fixMissingLocalSymbolImports`).
 *
 * Inclusions reflect "real importable code surface" of a generated artifact:
 *   - hooks/      — `useReducedMotion` and friends
 *   - components/ — generated React components (PascalCase exports)
 *   - lib/        — shared config/data/utilities (legacy default lane)
 *   - data/       — shared data modules
 *   - utils/      — shared util modules
 *
 * Exclusions:
 *   - components/ui/      — shadcn lane wins (`SHADCN_COMPONENTS` map +
 *                           `import-validator.detectMissingImports`); avoiding
 *                           this prevents fighting shadcn over the same names
 *   - app/                — pages export `metadata` and the page component
 *                           itself, which are not import targets for siblings
 *   - node_modules/       — never source of generated artifacts
 *   - autofix-stub:*      — dossier/cross-file-checker placeholders are not
 *                           canonical sources; they exist to satisfy the
 *                           resolver until the real file arrives
 */
export function isIndexableSharedFile(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (/(^|\/)node_modules\//.test(normalized)) return false;
  if (/(^|\/)app\//.test(normalized)) return false;
  if (/(^|\/)components\/ui\//.test(normalized)) return false;
  return /(^|\/)(hooks|components|lib|data|utils)\//.test(normalized);
}

export function toAliasImportPath(path: string): string {
  let normalized = path.replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/i, "");
  if (normalized.startsWith("src/")) normalized = normalized.slice(4);
  if (normalized.endsWith("/index")) normalized = normalized.slice(0, -"/index".length);
  return `@/${normalized}`;
}

function symbolLooksUsed(code: string, name: string): boolean {
  const escaped = escapeRegExp(name);
  const patterns = [
    new RegExp(`\\b${escaped}\\s*\\.`, "m"),
    new RegExp(`\\b${escaped}\\s*\\(`, "m"),
    new RegExp(`\\b${escaped}\\s*(?:,|;|\\)|\\]|\\}|\\?|:)`, "m"),
    new RegExp(`(?:=|return|:|\\(|\\[|\\{)\\s*${escaped}\\b`, "m"),
  ];
  // JSX usage: `<Reveal ...>`, `<Reveal/>`, `<Reveal>`, `</Reveal>` and the
  // generic-tag form `<DataTable<Row> ...>` where the char right after the name
  // is `<` (TS type arguments on a JSX component). Without this a local
  // PascalCase component rendered ONLY as a JSX tag is never recognised as
  // "used", so a uniquely-exported local component (e.g. `components/reveal.tsx`
  // -> `<Reveal>`) is left unimported and the page crashes with
  // `ReferenceError: <Name> is not defined`.
  //
  // Gated to PascalCase: React only treats capitalised tags as component
  // references; an intrinsic HTML/SVG tag is lowercase. A local lowercase export
  // that collides with one (e.g. `export const path` while a sibling renders
  // `<svg><path/></svg>`) must NOT be treated as used, or we inject a bogus
  // unused import that can push the lint quality gate over its warning budget.
  if (/^[A-Z]/.test(name)) {
    patterns.push(
      new RegExp(`<${escaped}[\\s/><]`, "m"),
      new RegExp(`</${escaped}>`, "m"),
    );
  }
  return patterns.some((pattern) => pattern.test(code));
}

/**
 * Add named imports for `importPath`, kind-aware.
 *
 * `options.typeNames` marks which of `names` are TYPE-only exports at the
 * source module. Those are emitted as `import type { X }` (all-type line) or
 * inline `{ type X, y }` (mixed line) so a type-only export is never injected
 * as a value binding. The merge branch preserves the kind of EXISTING
 * specifiers: merging a value symbol into `import type { Lang } from "..."`
 * must not demote `Lang` to a value import (prod chat fc0f053b: the injected
 * value-import of `type Lang` kept tripping the verifier, which "fixed" it,
 * and the next generation re-dropped it — three rounds of the same fault).
 */
function addNamedImport(
  code: string,
  importPath: string,
  names: string[],
  options: { typeNames?: ReadonlySet<string> } = {},
): string {
  const addTypeNames = options.typeNames ?? new Set<string>();
  const samePathNamedImport = new RegExp(
    `import\\s+(type\\s+)?\\{([^}]+)\\}\\s+from\\s+["']${escapeRegExp(importPath)}["'];?`,
  );

  type Spec = { render: string; isType: boolean };
  const specsByLocal = new Map<string, Spec>();

  const match = code.match(samePathNamedImport);
  if (match) {
    const headerTypeOnly = Boolean(match[1]);
    for (const part of match[2].split(",")) {
      const raw = part.trim();
      if (!raw) continue;
      const inlineType = /^type\s+/.test(raw);
      const base = raw.replace(/^type\s+/, "").trim();
      const aliasParts = base.split(/\s+as\s+/i).map((segment) => segment.trim());
      const local = aliasParts[aliasParts.length - 1] ?? "";
      if (!local) continue;
      specsByLocal.set(local, { render: base, isType: headerTypeOnly || inlineType });
    }
  }
  for (const name of names) {
    if (specsByLocal.has(name)) continue;
    specsByLocal.set(name, { render: name, isType: addTypeNames.has(name) });
  }

  const sorted = [...specsByLocal.entries()].sort(([a], [b]) => a.localeCompare(b));
  const allType = sorted.length > 0 && sorted.every(([, spec]) => spec.isType);
  const body = sorted
    .map(([, spec]) => (spec.isType && !allType ? `type ${spec.render}` : spec.render))
    .join(", ");
  const importLine = allType
    ? `import type { ${body} } from "${importPath}";`
    : `import { ${body} } from "${importPath}";`;

  if (match) {
    return code.replace(match[0], importLine);
  }
  return insertImportAfterDirectives(code, importLine);
}

export function buildProjectExportIndex(files: CodeFile[]): ExportIndex {
  const index = new Map<string, string[]>();

  for (const entry of BASELINE_EXPORTS) {
    index.set(entry.symbol, [entry.importPath]);
  }

  for (const file of files) {
    if (!/\.(tsx?|jsx?)$/i.test(file.path)) continue;
    if (!isIndexableSharedFile(file.path)) continue;
    if (file.content.includes("autofix-stub:")) continue;

    const importPath = toAliasImportPath(file.path);
    const exportNames = new Set<string>();

    for (const match of file.content.matchAll(EXPORT_DECL_RE)) {
      if (isEligibleSharedSymbol(match[1])) {
        exportNames.add(match[1]);
      }
    }
    for (const match of file.content.matchAll(EXPORT_LIST_RE)) {
      const names = match[1]
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const aliasParts = part.split(/\s+as\s+/i);
          return aliasParts[aliasParts.length - 1]!.trim();
        })
        .filter((name) => isEligibleSharedSymbol(name));
      for (const name of names) {
        exportNames.add(name);
      }
    }

    for (const name of exportNames) {
      const existing = index.get(name) ?? [];
      if (!existing.includes(importPath)) {
        existing.push(importPath);
        index.set(name, existing);
      }
    }
  }

  return index;
}

/**
 * Same declaration scan as `buildProjectExportIndex`, but with the export
 * KEYWORD captured so type-only exports can be told apart from values.
 */
const EXPORT_DECL_KIND_RE =
  /\bexport\s+(const|let|var|function|async\s+function|class|enum|type|interface)\s+([A-Za-z_$][\w$]*)\b/g;

/**
 * importPath → symbols that module exports as TYPE-only (`export type X`,
 * `export interface X`). Companion to `buildProjectExportIndex` (same file
 * filters) so `fixMissingLocalSymbolImports` can emit `import type { Lang }`
 * instead of a value import for a type export.
 *
 * Background (prod chat fc0f053b, 2026-08-11): `lib/i18n.ts` exports
 * `type Lang` plus value helpers. The fixer injected all three as ONE value
 * import, the verifier flagged the type-as-value binding, the LLM fixer
 * rewrote it, and the next generation re-dropped it — the same fault was
 * "fixed" three times in one session. Emitting the right kind up front ends
 * that loop.
 *
 * Declaration form only: `export type { X }` re-export lists never enter the
 * main export index (its `EXPORT_LIST_RE` does not match the `type` keyword),
 * so they cannot be injected and need no kind here.
 *
 * A name exported both as a type AND a value by the same module stays a value
 * import (the value binding also carries the type).
 */
export function buildProjectTypeOnlyExportIndex(files: CodeFile[]): Map<string, Set<string>> {
  const byPath = new Map<string, Set<string>>();

  for (const file of files) {
    if (!/\.(tsx?|jsx?)$/i.test(file.path)) continue;
    if (!isIndexableSharedFile(file.path)) continue;
    if (file.content.includes("autofix-stub:")) continue;

    const importPath = toAliasImportPath(file.path);
    const typeNames = new Set<string>();
    const valueNames = new Set<string>();

    for (const match of file.content.matchAll(EXPORT_DECL_KIND_RE)) {
      const kind = match[1];
      const name = match[2];
      if (!name || !isEligibleSharedSymbol(name)) continue;
      if (kind === "type" || kind === "interface") typeNames.add(name);
      else valueNames.add(name);
    }

    for (const name of valueNames) typeNames.delete(name);
    if (typeNames.size > 0) {
      const existing = byPath.get(importPath);
      if (existing) {
        for (const name of typeNames) existing.add(name);
      } else {
        byPath.set(importPath, typeNames);
      }
    }
  }

  return byPath;
}

export function buildProjectModuleExportIndex(files: CodeFile[]): ModuleExportIndex {
  const index = new Map<string, { named: Set<string>; hasDefault: boolean; defaultName: string | null }>();

  for (const file of files) {
    if (!/\.(tsx?|jsx?)$/i.test(file.path)) continue;

    const named = new Set<string>();
    let hasDefault = false;
    let defaultName: string | null = null;

    for (const match of file.content.matchAll(EXPORT_DECL_RE)) {
      if (match[1]) named.add(match[1]);
    }
    for (const match of file.content.matchAll(EXPORT_LIST_RE)) {
      for (const part of match[1].split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const aliasParts = trimmed.split(/\s+as\s+/i);
        const original = aliasParts[0]?.trim();
        const exported = aliasParts[aliasParts.length - 1]?.trim();
        if (exported === "default") {
          hasDefault = true;
          defaultName = original ?? defaultName;
        } else if (exported) {
          named.add(exported);
        }
      }
    }
    for (const match of file.content.matchAll(DEFAULT_FUNCTION_EXPORT_RE)) {
      hasDefault = true;
      defaultName = match[1] ?? defaultName;
    }
    for (const match of file.content.matchAll(DEFAULT_CLASS_EXPORT_RE)) {
      hasDefault = true;
      defaultName = match[1] ?? defaultName;
    }
    for (const match of file.content.matchAll(DEFAULT_IDENTIFIER_EXPORT_RE)) {
      hasDefault = true;
      defaultName = match[1] ?? defaultName;
    }

    index.set(normalizeFilePath(file.path), { named, hasDefault, defaultName });
  }

  return index;
}

/**
 * Default-export index: exported name → alias import path(s) of the own-project
 * files that default-export it.
 *
 * `buildProjectExportIndex` only sees NAMED exports, so `components/reveal.tsx`
 * with `export default function Reveal` is invisible there. Same file filter
 * (`isIndexableSharedFile`) as the named index, so `app/` pages and the shadcn
 * lane stay out. Consumers must only inject an import when a name maps to
 * exactly ONE module — a name exported by several files is ambiguous and is
 * left for the repair loop.
 */
export function buildProjectDefaultExportIndex(files: CodeFile[]): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const [path, entry] of buildProjectModuleExportIndex(files)) {
    if (!entry.hasDefault || !entry.defaultName) continue;
    if (!isIndexableSharedFile(path)) continue;
    const modulePath = toAliasImportPath(path);
    const bucket = index.get(entry.defaultName) ?? [];
    if (!bucket.includes(modulePath)) bucket.push(modulePath);
    index.set(entry.defaultName, bucket);
  }

  return index;
}

export function fixMissingLocalSymbolImports(
  code: string,
  filePath: string,
  exportIndex: ExportIndex,
  /** From `buildProjectTypeOnlyExportIndex` — marks which symbols need `import type`. */
  typeOnlyExportsByPath?: ReadonlyMap<string, ReadonlySet<string>>,
): { code: string; fixed: boolean; addedSymbols: string[] } {
  const imported = extractImportedNames(code);
  const declared = extractLocalDeclarations(code);
  const groupedByPath = new Map<string, string[]>();

  for (const [symbol, candidates] of exportIndex.entries()) {
    if (imported.has(symbol) || declared.has(symbol)) continue;
    if (!symbolLooksUsed(code, symbol)) continue;

    const otherCandidates = candidates.filter((candidate) => candidate !== toAliasImportPath(filePath));
    if (otherCandidates.length !== 1) continue;

    const importPath = otherCandidates[0]!;
    const existing = groupedByPath.get(importPath) ?? [];
    existing.push(symbol);
    groupedByPath.set(importPath, existing);
  }

  if (groupedByPath.size === 0) {
    return { code, fixed: false, addedSymbols: [] };
  }

  let nextCode = code;
  const addedSymbols: string[] = [];
  for (const [importPath, names] of groupedByPath) {
    const uniqueNames = [...new Set(names)].sort();
    const typeNames = typeOnlyExportsByPath?.get(importPath);
    nextCode = addNamedImport(
      nextCode,
      importPath,
      uniqueNames,
      typeNames && typeNames.size > 0 ? { typeNames } : {},
    );
    addedSymbols.push(...uniqueNames);
  }

  return {
    code: nextCode,
    fixed: nextCode !== code,
    addedSymbols: addedSymbols.sort(),
  };
}

export function fixLocalDefaultImportMismatches(
  code: string,
  filePath: string,
  files: CodeFile[],
  moduleExportIndex: ModuleExportIndex,
): { code: string; fixed: boolean; rewiredImports: string[] } {
  const fileMap = new Map<string, CodeFile>(
    files.map((file) => [normalizeFilePath(file.path), file]),
  );
  const rewiredImports: string[] = [];
  let nextCode = code;

  for (const match of code.matchAll(LOCAL_DEFAULT_IMPORT_LINE_RE)) {
    const full = match[0];
    const prefix = match[1] ?? "import ";
    const defaultLocal = match[2];
    const existingNamedSpecifiers = match[4] ?? "";
    const source = match[5];

    if (!source.startsWith("@/") && !source.startsWith("./") && !source.startsWith("../")) continue;

    const targetPath = resolveLocalImportPath(fileMap, filePath, source);
    if (!targetPath) continue;

    const target = moduleExportIndex.get(normalizeFilePath(targetPath));
    if (!target || target.hasDefault) continue;
    if (!target.named.has(defaultLocal)) continue;

    const namedImports = parseImportNames(existingNamedSpecifiers);
    if (namedImports.includes(defaultLocal)) continue;

    const nextNamedImports = [...namedImports, defaultLocal];
    const rewritten = `${prefix}{ ${nextNamedImports.join(", ")} } from "${source}";`;
    nextCode = nextCode.replace(full, rewritten);
    rewiredImports.push(source);
  }

  return {
    code: nextCode,
    fixed: nextCode !== code,
    rewiredImports: [...new Set(rewiredImports)].sort(),
  };
}

export function fixLocalNamedImportDefaultMismatches(
  code: string,
  filePath: string,
  files: CodeFile[],
  moduleExportIndex: ModuleExportIndex,
): { code: string; fixed: boolean; rewiredImports: string[] } {
  const fileMap = new Map<string, CodeFile>(
    files.map((file) => [normalizeFilePath(file.path), file]),
  );
  const rewiredImports: string[] = [];
  let nextCode = code;

  for (const match of code.matchAll(LOCAL_NAMED_IMPORT_LINE_RE)) {
    const full = match[0];
    const prefix = match[1] ?? "import ";
    const namedSpecifiersRaw = match[2] ?? "";
    const source = match[3];

    if (!source.startsWith("@/") && !source.startsWith("./") && !source.startsWith("../")) continue;

    const targetPath = resolveLocalImportPath(fileMap, filePath, source);
    if (!targetPath) continue;

    const target = moduleExportIndex.get(normalizeFilePath(targetPath));
    if (!target?.hasDefault || !target.defaultName) continue;

    const parsed = parseNamedImportSpecifiersDetailed(namedSpecifiersRaw);
    if (parsed.length === 0) continue;

    const unresolvedNamed = parsed.filter(
      (spec) => !spec.raw.startsWith("type ") && !target.named.has(spec.imported),
    );
    const defaultNameCandidate = target.defaultName
      ? unresolvedNamed.find((spec) => spec.imported === target.defaultName)
      : undefined;
    const defaultCandidate =
      defaultNameCandidate ??
      (unresolvedNamed.length === 1 ? unresolvedNamed[0] : undefined);
    if (!defaultCandidate) continue;

    const remaining = parsed.filter((spec) => spec !== defaultCandidate);
    const rewritten =
      remaining.length > 0
        ? `${prefix}${defaultCandidate.local}, { ${remaining.map(formatNamedImportSpecifier).join(", ")} } from "${source}";`
        : `${prefix}${defaultCandidate.local} from "${source}";`;
    nextCode = nextCode.replace(full, rewritten);
    rewiredImports.push(source);
  }

  return {
    code: nextCode,
    fixed: nextCode !== code,
    rewiredImports: [...new Set(rewiredImports)].sort(),
  };
}

/**
 * Module specifiers that resolve to the file itself. A module importing from
 * its own path (e.g. `components/ui/carousel.tsx` doing
 * `import { Carousel } from "@/components/ui/carousel"`) is always wrong and
 * causes TS2440 "Import declaration conflicts with local declaration" because
 * the imported name re-declares the symbol the file already exports. Covers the
 * `@/` alias form and the direct `./<basename>` relative form.
 */
function computeSelfImportSpecifiers(filePath: string): Set<string> {
  const specs = new Set<string>();
  specs.add(toAliasImportPath(filePath));
  const normalized = filePath.replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/i, "");
  const base = normalized.split("/").pop();
  if (base) specs.add(`./${base}`);
  return specs;
}

export function fixImportedDeclarationConflicts(
  code: string,
  filePath?: string,
  options?: {
    /**
     * Local binding names the compiler has CONFIRMED conflict with a local
     * declaration (parsed from `TS2440: Import declaration conflicts with
     * local declaration of 'X'`). For these, the usage-between-import-and-
     * declaration guard is skipped — the file does not compile with the
     * conflict in place, so dropping the import in favour of an existing
     * local VALUE declaration is the deterministic resolution (prod chat
     * `85f8db72`: `CircleDot` imported from lucide-react AND declared as a
     * local component, used in JSX above the declaration — the heuristic
     * guard refused, two runs never reached `passed`).
     */
    confirmedConflicts?: ReadonlySet<string>;
  },
): { code: string; fixed: boolean; removedBindings: string[] } {
  const declarations = extractLocalDeclarations(code);
  const confirmedConflicts = options?.confirmedConflicts;
  // When the file path is known, treat self-module-path imports as conflicts
  // unconditionally (a module cannot meaningfully import from itself), in
  // addition to the general local-redeclaration rule below.
  const selfSpecifiers = filePath
    ? computeSelfImportSpecifiers(filePath)
    : new Set<string>();
  if (
    declarations.size === 0 &&
    selfSpecifiers.size === 0 &&
    (confirmedConflicts?.size ?? 0) === 0
  ) {
    return { code, fixed: false, removedBindings: [] };
  }

  const removedBindings: string[] = [];
  type Patch = { start: number; end: number; replacement: string };
  const patches: Patch[] = [];

  for (const match of code.matchAll(LOCAL_DEFAULT_IMPORT_LINE_RE)) {
    const full = match[0];
    const offset = match.index ?? 0;
    const importEnd = offset + full.length;
    const prefix = match[1] ?? "";
    const defaultLocal = match[2];
    const namedPart = match[3];
    const namedSpecs = match[4] ?? "";
    const source = match[5];

    const namedSpecsParsed = parseNamedImportSpecifiersDetailed(namedSpecs);

    if (selfSpecifiers.has(source)) {
      // Self-module-path import: drop the whole statement (default + named).
      removedBindings.push(defaultLocal);
      for (const spec of namedSpecsParsed) removedBindings.push(spec.local);
      patches.push({
        start: offset,
        end: endOfRemovedImportLine(code, importEnd),
        replacement: "",
      });
      continue;
    }

    const keptNamed = namedSpecsParsed.filter((spec) => {
      if (
        !shouldDropConflictingImportBinding(
          code,
          declarations,
          spec.local,
          importEnd,
          confirmedConflicts,
        )
      ) {
        return true;
      }
      removedBindings.push(spec.local);
      return false;
    });

    const defaultDrop = shouldDropConflictingImportBinding(
      code,
      declarations,
      defaultLocal,
      importEnd,
      confirmedConflicts,
    );
    if (defaultDrop) {
      removedBindings.push(defaultLocal);
    }

    let replacement: string;
    if (defaultDrop && keptNamed.length === 0) {
      replacement = "";
    } else if (defaultDrop) {
      replacement = `${prefix}{ ${keptNamed.map(formatNamedImportSpecifier).join(", ")} } from "${source}";`;
    } else if ((namedSpecsParsed.length > 0 || namedPart) && keptNamed.length !== namedSpecsParsed.length) {
      replacement = `${prefix}${defaultLocal}, { ${keptNamed.map(formatNamedImportSpecifier).join(", ")} } from "${source}";`;
    } else {
      replacement = full;
    }

    if (replacement !== full) {
      patches.push({
        start: offset,
        end: replacement === "" ? endOfRemovedImportLine(code, importEnd) : importEnd,
        replacement,
      });
    }
  }

  for (const match of code.matchAll(LOCAL_NAMED_IMPORT_LINE_RE)) {
    const full = match[0];
    const offset = match.index ?? 0;
    const importEnd = offset + full.length;
    const prefix = match[1] ?? "";
    const specifiers = match[2] ?? "";
    const source = match[3];

    const namedSpecsParsed = parseNamedImportSpecifiersDetailed(specifiers);

    if (selfSpecifiers.has(source)) {
      // Self-module-path import: drop every named binding (remove the line).
      for (const spec of namedSpecsParsed) removedBindings.push(spec.local);
      patches.push({
        start: offset,
        end: endOfRemovedImportLine(code, importEnd),
        replacement: "",
      });
      continue;
    }

    const keptNamed = namedSpecsParsed.filter((spec) => {
      if (
        !shouldDropConflictingImportBinding(
          code,
          declarations,
          spec.local,
          importEnd,
          confirmedConflicts,
        )
      ) {
        return true;
      }
      removedBindings.push(spec.local);
      return false;
    });

    if (keptNamed.length === namedSpecsParsed.length) {
      continue;
    }

    const replacement =
      keptNamed.length === 0
        ? ""
        : `${prefix}{ ${keptNamed.map(formatNamedImportSpecifier).join(", ")} } from "${source}";`;

    patches.push({
      start: offset,
      end: replacement === "" ? endOfRemovedImportLine(code, importEnd) : importEnd,
      replacement,
    });
  }

  patches.sort((a, b) => b.start - a.start);
  let nextCode = code;
  for (const p of patches) {
    nextCode = nextCode.slice(0, p.start) + p.replacement + nextCode.slice(p.end);
  }

  return {
    code: nextCode,
    fixed: nextCode !== code,
    removedBindings: [...new Set(removedBindings)].sort(),
  };
}

const REACT_TYPE_NAMES = new Set([
  "ReactNode",
  "PropsWithChildren",
  "ComponentType",
  "CSSProperties",
]);

function extractReactTypeImports(code: string): Set<string> {
  const names = new Set<string>();
  const typeMatch = code.match(TYPE_IMPORT_RE);
  if (typeMatch) {
    for (const name of parseImportNames(typeMatch[1])) {
      names.add(name);
    }
  }
  const regularMatch = code.match(REACT_IMPORT_RE);
  if (regularMatch) {
    for (const name of parseImportNames(regularMatch[1])) {
      names.add(name);
    }
  }
  return names;
}

export function fixMissingReactTypeImports(
  code: string,
): { code: string; fixed: boolean; addedTypes: string[] } {
  const alreadyImported = extractReactTypeImports(code);
  const missing = [...REACT_TYPE_NAMES]
    .filter((name) => !alreadyImported.has(name) && new RegExp(`\\b${name}\\b`).test(code))
    .sort();

  if (missing.length === 0) {
    return { code, fixed: false, addedTypes: [] };
  }

  const importLine = `import type { ${missing.join(", ")} } from "react";`;
  return {
    code: insertImportAfterDirectives(code, importLine),
    fixed: true,
    addedTypes: missing,
  };
}

const WRONG_IMAGE_IMPORT_RE =
  /import\s*\{([^}]*)\bImage\b([^}]*)\}\s*from\s*["']lucide-react["'];?/;

export function fixNextImageImport(
  code: string,
): { code: string; fixed: boolean; added: boolean } {
  if (!IMAGE_USAGE_RE.test(code)) {
    return { code, fixed: false, added: false };
  }
  if (NEXT_IMAGE_IMPORT_RE.test(code)) {
    return { code, fixed: false, added: false };
  }
  if (WRONG_IMAGE_IMPORT_RE.test(code)) {
    return { code, fixed: false, added: false };
  }
  if (extractImportedNames(code).has("Image")) {
    return { code, fixed: false, added: false };
  }
  if (extractLocalDeclarations(code).has("Image")) {
    return { code, fixed: false, added: false };
  }

  const nextCode = insertImportAfterDirectives(code, 'import Image from "next/image";');
  return { code: nextCode, fixed: nextCode !== code, added: nextCode !== code };
}

export function fixNextOgImageResponseImport(
  code: string,
): { code: string; fixed: boolean; added: boolean } {
  if (!IMAGE_RESPONSE_USAGE_RE.test(code)) {
    return { code, fixed: false, added: false };
  }
  if (NEXT_OG_IMAGE_RESPONSE_IMPORT_RE.test(code)) {
    return { code, fixed: false, added: false };
  }
  if (extractImportedNames(code).has("ImageResponse")) {
    return { code, fixed: false, added: false };
  }
  if (extractLocalDeclarations(code).has("ImageResponse")) {
    return { code, fixed: false, added: false };
  }

  const nextCode = addNamedImport(code, "next/og", ["ImageResponse"]);
  return { code: nextCode, fixed: nextCode !== code, added: nextCode !== code };
}
