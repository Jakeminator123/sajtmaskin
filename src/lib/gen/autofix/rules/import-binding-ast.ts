import ts from "typescript";

/** Local component paths that the LLM sometimes hallucinates as separate modules. */
export const STUB_PATH_RE = /^[@.]\/components\//;

export function isStubModuleSpecifier(spec: string): boolean {
  return STUB_PATH_RE.test(spec);
}

/**
 * Picks the TypeScript `ScriptKind` from a file extension so the parser
 * understands the dialect correctly:
 *
 *   - `.tsx` → TSX  (TypeScript + JSX)
 *   - `.jsx` → JSX  (JavaScript + JSX) — without this, valid `.jsx` with JSX
 *               was parsed as plain TS and looked "already broken", which let
 *               a corrupt fixer output slip past the validity guard.
 *   - `.js`  → JS   (JavaScript, no TS-only syntax)
 *   - `.ts` / anything else → TS
 *
 * Note: `ScriptKind.JS`/`.JSX` still accept most syntax leniently; the point
 * is that `.jsx` must NOT be parsed as `.ts` (where a bare `<Tag>` is a type
 * assertion / comparison and trips the parser).
 */
export function scriptKindForFile(filePath: string): ts.ScriptKind {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  // `.ts`, `.mts`, `.cts` and anything else → TS dialect.
  return ts.ScriptKind.TS;
}

/**
 * Files the validity guards cover. Aligned with {@link scriptKindForFile} so
 * module-suffixed paths (`next.config.mjs`, `app/foo.mts`, `.cjs`, `.cts`) are
 * NOT silently bypassed — `runAutoFixSinglePass` enters import-validator based
 * on fence language (`js`/`ts`), so the guard must cover those extensions too.
 *
 * Covers: ts, tsx, mts, cts, js, jsx, mjs, cjs.
 */
export const GUARDABLE_EXT_RE = /\.(?:[mc]?tsx?|[mc]?jsx?)$/i;

export function isGuardablePath(filePath: string): boolean {
  return GUARDABLE_EXT_RE.test(filePath);
}

/** JavaScript-dialect files where TS-only syntax is INVALID. */
const JS_DIALECT_EXT_RE = /\.(?:[mc]?jsx?)$/i;

/**
 * True when `sf` contains TypeScript-only syntax that is invalid in a plain
 * JavaScript file. The TS parser accepts TS grammar regardless of script kind
 * (so `parseDiagnostics` stays 0 for `import type` / annotations in a `.js`
 * file), so this AST walk is needed to detect what the JS/SWC/esbuild loader
 * would later reject. Returns on the first hit (cheap).
 */
function hasTsOnlySyntax(sf: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly === true) ||
      (ts.isExportDeclaration(node) && node.isTypeOnly) ||
      (ts.isImportSpecifier(node) && node.isTypeOnly) ||
      (ts.isExportSpecifier(node) && node.isTypeOnly) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isTypeNode(node) // annotations, generics, `x as T` type child, etc.
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

export function createTsxSourceFile(filePath: string, code: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(filePath),
  );
}

/**
 * Counts hard syntactic (parse) errors via the TypeScript parser. Synchronous
 * and dependency-free (TS is a runtime dependency), so it works in
 * production-style installs where the dev-only `esbuild` may be absent.
 *
 * Uses the correct per-extension `ScriptKind` (see {@link scriptKindForFile}),
 * so valid `.jsx`/`.tsx` with JSX is NOT mis-flagged as broken. The TS parser
 * also catches the orphaned-import comma shape (`Zap,\n; from; "x";`) that
 * esbuild treats as syntactically valid.
 *
 * For **JavaScript-dialect** files (`.js`/`.jsx`/`.mjs`/`.cjs`) it ALSO counts
 * TypeScript-only syntax (e.g. `import type`, `export type`, interfaces, type
 * aliases, type annotations) as an error: the TS parser accepts that grammar
 * leniently (0 `parseDiagnostics`), but the JS/SWC/esbuild loader rejects it,
 * so a fixer that injects `import type { LucideProps }` into `app/page.js`
 * must be revertible.
 *
 * `parseDiagnostics` is the parser's syntactic-error list; it needs no Program
 * / type-checker, so this stays cheap and synchronous.
 */
export function countParseErrors(code: string, filePath: string): number {
  const sf = createTsxSourceFile(filePath, code);
  const diagnostics = (sf as ts.SourceFile & {
    parseDiagnostics?: readonly ts.Diagnostic[];
  }).parseDiagnostics;
  let count = diagnostics?.length ?? 0;
  if (count === 0 && JS_DIALECT_EXT_RE.test(filePath) && hasTsOnlySyntax(sf)) {
    count += 1;
  }
  return count;
}

export type ImportBindingRow = {
  name: string;
  declaration: ts.ImportDeclaration;
  isStub: boolean;
};

/**
 * Collects every local binding introduced by import declarations (default, namespace, named).
 */
export function collectImportBindingRows(sf: ts.SourceFile): ImportBindingRow[] {
  const rows: ImportBindingRow[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    if (!st.moduleSpecifier || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const mod = st.moduleSpecifier.text;
    const stub = isStubModuleSpecifier(mod);
    const ic = st.importClause;
    if (!ic) continue;

    if (ic.name) {
      rows.push({ name: ic.name.text, declaration: st, isStub: stub });
    }
    if (ic.namedBindings) {
      if (ts.isNamespaceImport(ic.namedBindings)) {
        rows.push({ name: ic.namedBindings.name.text, declaration: st, isStub: stub });
      } else if (ts.isNamedImports(ic.namedBindings)) {
        for (const el of ic.namedBindings.elements) {
          rows.push({ name: el.name.text, declaration: st, isStub: stub });
        }
      }
    }
  }
  return rows;
}

/**
 * Removes named/default bindings from an import declaration, or drops the whole declaration.
 */
export function pruneImportDeclarationBindings(
  node: ts.ImportDeclaration,
  removeNames: Set<string>,
): ts.ImportDeclaration | undefined {
  const ic = node.importClause;
  if (!ic) return undefined;

  let newDefault = ic.name;
  if (newDefault && removeNames.has(newDefault.text)) {
    newDefault = undefined;
  }

  let newNamed: ts.NamedImportBindings | undefined = ic.namedBindings;
  if (ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
    const kept = ic.namedBindings.elements.filter((el) => !removeNames.has(el.name.text));
    if (kept.length === 0) {
      newNamed = undefined;
    } else {
      newNamed = ts.factory.updateNamedImports(ic.namedBindings, kept);
    }
  } else if (ic.namedBindings && ts.isNamespaceImport(ic.namedBindings)) {
    if (removeNames.has(ic.namedBindings.name.text)) {
      newNamed = undefined;
    }
  }

  if (!newDefault && !newNamed) {
    return undefined;
  }

  const newIc = ts.factory.updateImportClause(ic, ic.isTypeOnly, newDefault, newNamed);
  const attributes = (node as ts.ImportDeclaration & { attributes?: ts.ImportAttributes }).attributes;
  return ts.factory.updateImportDeclaration(
    node,
    node.modifiers,
    newIc,
    node.moduleSpecifier,
    attributes ?? node.assertClause,
  );
}

/**
 * Rebuilds a source file, dropping or pruning import declarations per `dropsByDecl`.
 */
export function applyImportBindingRemovals(
  sf: ts.SourceFile,
  dropsByDecl: Map<ts.ImportDeclaration, Set<string>>,
): ts.SourceFile {
  const newStatements: ts.Statement[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) {
      newStatements.push(st);
      continue;
    }
    const toDrop = dropsByDecl.get(st);
    if (!toDrop || toDrop.size === 0) {
      newStatements.push(st);
      continue;
    }
    const pruned = pruneImportDeclarationBindings(st, toDrop);
    if (pruned) newStatements.push(pruned);
  }
  return ts.factory.updateSourceFile(sf, newStatements);
}

/** Known collisions with npm/runtime exports when LLM adds a bogus @/components/* default import. */
const DENY_STUB_DEFAULT_NAMES = new Set<string>([
  "RapierRigidBody",
  "WebGLRenderer",
  "CanvasErrorBoundary",
  "WebGLErrorBoundary",
]);

const DENY_STUB_NAME_RE = /^(?:HTML|SVG)[A-Z][A-Za-z0-9]*$/;

/**
 * Default-import names that should never trigger a generated @/components/* stub
 * (usually a mistaken duplicate of a DOM type or a runtime export).
 */
export function isDenylistedStubDefaultName(name: string): boolean {
  if (DENY_STUB_DEFAULT_NAMES.has(name)) return true;
  return DENY_STUB_NAME_RE.test(name);
}

export function getLocalBindingNamesFromImportDeclaration(
  decl: ts.ImportDeclaration,
): string[] {
  const ic = decl.importClause;
  if (!ic) return [];
  const names: string[] = [];
  if (ic.name) names.push(ic.name.text);
  if (ic.namedBindings) {
    if (ts.isNamespaceImport(ic.namedBindings)) {
      names.push(ic.namedBindings.name.text);
    } else if (ts.isNamedImports(ic.namedBindings)) {
      for (const el of ic.namedBindings.elements) {
        names.push(el.name.text);
      }
    }
  }
  return names;
}

export function removeImportDeclarations(
  sf: ts.SourceFile,
  toRemove: Set<ts.ImportDeclaration>,
): ts.SourceFile {
  const kept = sf.statements.filter(
    (st) => !(ts.isImportDeclaration(st) && toRemove.has(st)),
  );
  return ts.factory.updateSourceFile(sf, kept);
}
