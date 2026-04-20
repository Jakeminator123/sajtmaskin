/**
 * Detects and removes duplicate import bindings — when the same identifier
 * is imported from two different sources.
 *
 * Uses the TypeScript AST so multiline / Prettier-formatted imports are handled.
 *
 * When a duplicate is found, the first import wins. If one import is from
 * a local stub path (e.g. @/components/image-icon) and the other from a
 * well-known package, the package import is preferred regardless of order.
 */

import ts from "typescript";
import {
  applyImportBindingRemovals,
  collectImportBindingRows,
  createTsxSourceFile,
  type ImportBindingRow,
} from "./import-binding-ast";

export function fixDuplicateImportBindings(
  code: string,
  filePath: string,
): { code: string; fixed: boolean; removedBindings: string[] } {
  const sf = createTsxSourceFile(filePath, code);
  const rows = collectImportBindingRows(sf);

  const seen = new Map<string, ImportBindingRow>();
  const toDropRows: ImportBindingRow[] = [];

  for (const row of rows) {
    const existing = seen.get(row.name);
    if (!existing) {
      seen.set(row.name, row);
      continue;
    }

    const drop =
      row.isStub && !existing.isStub ? row : existing.isStub && !row.isStub ? existing : row;
    const keep = drop === row ? existing : row;
    toDropRows.push(drop);
    seen.set(keep.name, keep);
  }

  if (toDropRows.length === 0) {
    return { code, fixed: false, removedBindings: [] };
  }

  const removedBindings = toDropRows.map((r) => r.name);
  const dropsByDecl = new Map<ts.ImportDeclaration, Set<string>>();
  for (const row of toDropRows) {
    if (!dropsByDecl.has(row.declaration)) dropsByDecl.set(row.declaration, new Set());
    dropsByDecl.get(row.declaration)!.add(row.name);
  }

  const updated = applyImportBindingRemovals(sf, dropsByDecl);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
  const out = printer.printFile(updated);

  return {
    code: out.endsWith("\n") || code.endsWith("\n") ? out : `${out}\n`,
    fixed: true,
    removedBindings,
  };
}
