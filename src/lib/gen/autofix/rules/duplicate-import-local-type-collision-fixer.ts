/**
 * Duplicate-import + local-type-collision fixer.
 *
 * Handles two related LLM error patterns not covered by
 * `duplicate-import-binding-fixer.ts` (which only dedups same-name imports
 * from different sources):
 *
 * 1. **Same-source duplicate default imports** — the LLM writes both
 *
 *      import ShowcaseVehicleCard from "@/components/showcase-vehicle";
 *      import ShowcaseVehicle from "@/components/showcase-vehicle";
 *
 *    (two default imports of the SAME module, different local names). Only
 *    one local name can correspond to the module's default export; the
 *    other is dead code but TypeScript still registers both bindings,
 *    potentially colliding with other declarations. Strategy: keep the
 *    import whose local name is actually referenced in the file; drop the
 *    other. If both (or neither) are referenced, keep the first and drop
 *    the rest.
 *
 * 2. **Import + local type-alias with same name** — e.g.
 *
 *      import ShowcaseVehicle from "@/components/showcase-vehicle";
 *      export type ShowcaseVehicle = { make: string };
 *
 *    This is a duplicate-identifier error (TS2300 / TS2440). Strategy: if
 *    the imported binding is not used in any value position (JSX, call,
 *    new, member access), drop the import. Keep the local type intact —
 *    renaming it would break external consumers.
 *
 * Scope: per-file, TypeScript-AST-based, side-effect-free. Runs after
 * `duplicate-import-binding-fixer` so the trivial same-name dedup happens
 * first.
 *
 * Empirical hit (chat `341cdc37...`, 2026-04-23): both sub-cases appeared
 * in `components/showcase-gallery.tsx` simultaneously.
 */

import ts from "typescript";
import type { FixEntry } from "../types";
import {
  applyImportBindingRemovals,
  collectImportBindingRows,
  createTsxSourceFile,
  type ImportBindingRow,
} from "./import-binding-ast";

type FixResult = {
  code: string;
  fixed: boolean;
  fixes: FixEntry[];
};

function collectLocalTypeNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const st of sf.statements) {
    if (ts.isTypeAliasDeclaration(st)) {
      names.add(st.name.text);
      continue;
    }
    if (ts.isInterfaceDeclaration(st)) {
      names.add(st.name.text);
    }
  }
  return names;
}

/**
 * Count references to `name` that look like value positions (approximate —
 * we only need a yes/no signal). Returns the total ref count excluding the
 * import-declaration site itself.
 */
function countValueReferences(code: string, name: string, sf: ts.SourceFile): number {
  const identifierRe = new RegExp(
    `\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`,
    "g",
  );
  let total = 0;
  let match: RegExpExecArray | null;
  while ((match = identifierRe.exec(code)) !== null) {
    const before = code.slice(Math.max(0, match.index - 12), match.index);
    // Skip occurrences that are part of an import/export declaration.
    if (/\b(?:import|export)\s+(?:\{[^}]*|type\s+\{[^}]*|[A-Za-z_$][\w$]*,?\s*)?$/.test(before)) {
      continue;
    }
    // Skip occurrences inside type alias / interface declarations.
    if (/\b(?:type|interface)\s+$/.test(before)) {
      continue;
    }
    total += 1;
  }
  // Subtract the identifier's appearance inside its own import declaration
  // line (we count e.g. `import ShowcaseVehicle ...` once more than needed).
  void sf;
  return total;
}

export function fixDuplicateImportAndLocalTypeCollision(
  code: string,
  filePath: string,
): FixResult {
  if (!code.includes("import")) {
    return { code, fixed: false, fixes: [] };
  }
  const sf = createTsxSourceFile(filePath, code);
  const rows = collectImportBindingRows(sf);
  if (rows.length === 0) {
    return { code, fixed: false, fixes: [] };
  }

  const dropsByDecl = new Map<ts.ImportDeclaration, Set<string>>();
  const droppedForDuplicateSource: string[] = [];
  const droppedForLocalTypeCollision: string[] = [];

  // Rule 1: same-source duplicate defaults.
  // Group default-import rows by their module specifier.
  const defaultsBySpecifier = new Map<string, ImportBindingRow[]>();
  for (const row of rows) {
    const ic = row.declaration.importClause;
    if (!ic?.name) continue;
    if (ic.name.text !== row.name) continue; // only the default slot
    const spec = row.declaration.moduleSpecifier as ts.StringLiteral;
    const key = spec.text;
    if (!defaultsBySpecifier.has(key)) defaultsBySpecifier.set(key, []);
    defaultsBySpecifier.get(key)!.push(row);
  }
  for (const [, duplicateDefaults] of defaultsBySpecifier) {
    if (duplicateDefaults.length < 2) continue;
    // Keep the default whose local name is actually referenced. Fall back
    // to the first row.
    const scored = duplicateDefaults.map((row) => ({
      row,
      uses: countValueReferences(code, row.name, sf),
    }));
    scored.sort((a, b) => b.uses - a.uses);
    const keeper = scored[0];
    for (const item of scored) {
      if (item === keeper) continue;
      if (!dropsByDecl.has(item.row.declaration)) {
        dropsByDecl.set(item.row.declaration, new Set());
      }
      dropsByDecl.get(item.row.declaration)!.add(item.row.name);
      droppedForDuplicateSource.push(item.row.name);
    }
  }

  // Rule 2: import + local type-alias/interface collision.
  const localTypes = collectLocalTypeNames(sf);
  for (const row of rows) {
    if (!localTypes.has(row.name)) continue;
    if (dropsByDecl.get(row.declaration)?.has(row.name)) continue;
    const uses = countValueReferences(code, row.name, sf);
    if (uses > 0) continue; // binding is used as a value — don't drop
    if (!dropsByDecl.has(row.declaration)) dropsByDecl.set(row.declaration, new Set());
    dropsByDecl.get(row.declaration)!.add(row.name);
    droppedForLocalTypeCollision.push(row.name);
  }

  if (dropsByDecl.size === 0) {
    return { code, fixed: false, fixes: [] };
  }

  const updated = applyImportBindingRemovals(sf, dropsByDecl);
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
  });
  const out = printer.printFile(updated);
  const next = out.endsWith("\n") || code.endsWith("\n") ? out : `${out}\n`;

  const descriptionParts: string[] = [];
  if (droppedForDuplicateSource.length > 0) {
    descriptionParts.push(
      `dropped duplicate default imports of same source: ${droppedForDuplicateSource.join(", ")}`,
    );
  }
  if (droppedForLocalTypeCollision.length > 0) {
    descriptionParts.push(
      `dropped imports that collided with local type declarations: ${droppedForLocalTypeCollision.join(", ")}`,
    );
  }

  return {
    code: next,
    fixed: true,
    fixes: [
      {
        fixer: "duplicate-import-local-type-collision-fixer",
        category: "mechanical",
        description: descriptionParts.join("; "),
        file: filePath,
      },
    ],
  };
}
