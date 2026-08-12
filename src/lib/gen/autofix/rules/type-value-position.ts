/**
 * Shared type-vs-value analysis for the two `import type` fixers.
 *
 * `type-only-import-fixer` (value import → `import type`) and
 * `value-used-from-type-import-fixer` (`import type` → value import) are exact
 * mirrors of each other. They must agree on every reference or they oscillate:
 * one converts an import, the next pass converts it straight back. Both used to
 * carry their own copy of this logic, which made that agreement a promise in a
 * doc comment rather than something the code enforced. It now lives here once.
 *
 * The analysis is AST-based (TypeScript's own parser, no type-checker, no
 * Program) rather than regex-based. A regex only ever sees the ~32 characters
 * before a name, and the decisive context is routinely further out:
 *
 *     const seed = { nested: { posts: blogPosts } };   // blogPosts is a VALUE
 *     type Archive = Record<string, { posts: BlogPost }>; // BlogPost is a TYPE
 *
 * Both have a `key:` immediately to the left, so a lookbehind cannot separate
 * them; the answer lives in what encloses the brace, and nesting means "what
 * encloses the brace" is itself a recursive question. The old heuristic got
 * BOTH of these backwards, which is how `lib/sanity/seed-content.ts` shipped
 * with `import type { blogPosts }` and crashed the generated blog at runtime
 * (2026-07-31). The parser answers it structurally instead of guessing, and
 * the same walk gets `typeof X`, generics, tuples, and braces inside strings
 * and comments right for free.
 */

import ts from "typescript";
import { collectImportBindingRows, createTsxSourceFile } from "./import-binding-ast";

type Classification = "type" | "value" | "unknown";

export type SymbolUsage = {
  /** References that only exist at compile time (annotations, generics, `typeof` in a type). */
  type: number;
  /** References that survive into the emitted JavaScript. */
  value: number;
  /** References we refuse to judge — a local shadow, a re-export, an unparseable file. */
  unknown: number;
};

const NO_USAGE: SymbolUsage = { type: 0, value: 0, unknown: 0 };

export type UsageIndex = {
  /** False when the file has parse errors; every lookup then reports `unknown`. */
  parsed: boolean;
  usageOf(name: string): SymbolUsage;
};

/** `Foo` or `Foo as Bar` — only the local binding (`Bar`) is referenced. */
export function bindingNameOf(specifier: string): string {
  const aliasMatch = specifier.match(/^[A-Za-z_$][\w$]*\s+as\s+([A-Za-z_$][\w$]*)\s*$/);
  if (aliasMatch) return aliasMatch[1];
  return specifier.trim();
}

/**
 * Identifier positions that are a *name*, not a reference to a binding:
 * `obj.Foo`, `{ Foo: 1 }`, `<x Foo={…} />`, the specifiers of the import
 * statement itself. Counting these as usages would let an unrelated property
 * that happens to share the name decide how the import is emitted.
 */
function isNamePosition(id: ts.Identifier, parent: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) return true;
  if (ts.isQualifiedName(parent) && parent.right === id) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === id) return true;
  if (ts.isPropertySignature(parent) && parent.name === id) return true;
  if (ts.isPropertyDeclaration(parent) && parent.name === id) return true;
  if (ts.isMethodDeclaration(parent) && parent.name === id) return true;
  if (ts.isMethodSignature(parent) && parent.name === id) return true;
  if (ts.isEnumMember(parent) && parent.name === id) return true;
  if (ts.isJsxAttribute(parent) && parent.name === id) return true;
  if (ts.isBindingElement(parent) && parent.propertyName === id) return true;
  if (ts.isImportSpecifier(parent)) return true;
  if (ts.isImportClause(parent)) return true;
  if (ts.isNamespaceImport(parent)) return true;
  return false;
}

/**
 * Positions where a *local* declaration reuses the imported name, plus
 * re-exports. Either way the file is telling us something the fixers should not
 * act on, so they are reported as `unknown` (which blocks both conversions)
 * rather than silently skipped.
 */
function isAmbiguousDeclaration(id: ts.Identifier, parent: ts.Node): boolean {
  if (ts.isExportSpecifier(parent)) return true;
  if (ts.isVariableDeclaration(parent) && parent.name === id) return true;
  if (ts.isFunctionDeclaration(parent) && parent.name === id) return true;
  if (ts.isClassDeclaration(parent) && parent.name === id) return true;
  if (ts.isInterfaceDeclaration(parent) && parent.name === id) return true;
  if (ts.isTypeAliasDeclaration(parent) && parent.name === id) return true;
  if (ts.isEnumDeclaration(parent) && parent.name === id) return true;
  if (ts.isParameter(parent) && parent.name === id) return true;
  if (ts.isTypeParameterDeclaration(parent) && parent.name === id) return true;
  if (ts.isModuleDeclaration(parent) && parent.name === id) return true;
  return false;
}

/** `null` = not a reference at all. */
function classifyIdentifier(id: ts.Identifier): Classification | null {
  const parent = id.parent as ts.Node | undefined;
  if (!parent) return null;
  if (isNamePosition(id, parent)) return null;
  if (isAmbiguousDeclaration(id, parent)) return "unknown";

  // Climb entity-name chains so `Foo.Bar` in a type position is judged by what
  // encloses the whole name, not by the innermost node.
  let ancestor: ts.Node | undefined = parent;
  while (ancestor && ts.isQualifiedName(ancestor)) {
    ancestor = ancestor.parent as ts.Node | undefined;
  }
  if (!ancestor) return "unknown";

  if (ts.isTypeNode(ancestor)) {
    // `class X extends Y` reads as a type node but is a real runtime reference;
    // `interface X extends Y` and `class X implements Y` are not.
    if (ts.isExpressionWithTypeArguments(ancestor)) {
      const heritage = ancestor.parent as ts.Node | undefined;
      if (
        heritage &&
        ts.isHeritageClause(heritage) &&
        heritage.token === ts.SyntaxKind.ExtendsKeyword &&
        heritage.parent &&
        ts.isClassLike(heritage.parent)
      ) {
        return "value";
      }
    }
    return "type";
  }

  return "value";
}

function parseErrorCount(sf: ts.SourceFile): number {
  return (
    (sf as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
      .parseDiagnostics?.length ?? 0
  );
}

/**
 * Parses `code` for reference analysis, or returns null when it cannot be read
 * cleanly.
 *
 * The extension picks the dialect, but a `.ts` file containing JSX is a shape
 * the generator does produce, and parsing it as plain TypeScript turns every
 * `<Tag />` into a cascade of syntax errors. Retrying as TSX only happens after
 * the extension-correct parse has already failed, so a genuine `.ts` file using
 * `<T>value` type assertions — which parses fine as TS — is never reinterpreted.
 */
function parseForUsage(filePath: string, code: string): ts.SourceFile | null {
  const primary = createTsxSourceFile(filePath, code);
  if (parseErrorCount(primary) === 0) return primary;
  const asTsx = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  return parseErrorCount(asTsx) === 0 ? asTsx : null;
}

/**
 * Counts how every identifier in `code` is referenced, keyed by name.
 *
 * Import declarations are skipped wholesale, so an import's own specifiers
 * never count as usages of themselves. A name bound by two or more import
 * declarations is forced to `unknown`: converting one of a duplicate pair is a
 * refactor, not a mechanical fix.
 */
export function indexIdentifierUsage(code: string, filePath: string): UsageIndex {
  const sf = parseForUsage(filePath, code);
  if (!sf) {
    return { parsed: false, usageOf: () => ({ type: 0, value: 0, unknown: 1 }) };
  }

  const usages = new Map<string, SymbolUsage>();
  const bump = (name: string, kind: Classification): void => {
    const current = usages.get(name) ?? { type: 0, value: 0, unknown: 0 };
    current[kind] += 1;
    usages.set(name, current);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) return;
    if (ts.isIdentifier(node)) {
      const verdict = classifyIdentifier(node);
      if (verdict) bump(node.text, verdict);
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  const importCounts = new Map<string, number>();
  for (const row of collectImportBindingRows(sf)) {
    importCounts.set(row.name, (importCounts.get(row.name) ?? 0) + 1);
  }
  for (const [name, count] of importCounts) {
    if (count < 2) continue;
    const current = usages.get(name) ?? { type: 0, value: 0, unknown: 0 };
    usages.set(name, { ...current, unknown: current.unknown + 1 });
  }

  return {
    parsed: true,
    usageOf: (name) => usages.get(name) ?? NO_USAGE,
  };
}

/**
 * True when `name` has at least one reference that survives into emitted
 * JavaScript **and** no reference was ambiguous.
 *
 * The `unknown` guard mirrors {@link isUsedOnlyAsType}: a local declaration
 * that reuses the imported name means the value reference most likely belongs
 * to the SHADOW, not to the import. Promoting the import on that evidence
 * pulls a runtime dependency into a file that never wanted one — and if the
 * module has side effects, it runs them. The compiler-confirmed override
 * (`forceValueSymbols` in the fixer) is unaffected: TS1361 is proof, whereas
 * this function only ever makes a local guess.
 */
export function isUsedAsValue(index: UsageIndex, name: string): boolean {
  const usage = index.usageOf(name);
  return usage.value > 0 && usage.unknown === 0;
}

/**
 * True when `name` is referenced, every reference is compile-time only, and
 * none was ambiguous. Deliberately strict: a single `unknown` blocks the
 * conversion, because demoting a runtime import to `import type` erases it at
 * build time and white-screens the page.
 */
export function isUsedOnlyAsType(index: UsageIndex, name: string): boolean {
  const usage = index.usageOf(name);
  return usage.type > 0 && usage.value === 0 && usage.unknown === 0;
}
