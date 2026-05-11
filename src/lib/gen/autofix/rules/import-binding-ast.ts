import ts from "typescript";

/** Local component paths that the LLM sometimes hallucinates as separate modules. */
export const STUB_PATH_RE = /^[@.]\/components\//;

export function isStubModuleSpecifier(spec: string): boolean {
  return STUB_PATH_RE.test(spec);
}

export function createTsxSourceFile(filePath: string, code: string): ts.SourceFile {
  const kind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, kind);
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
