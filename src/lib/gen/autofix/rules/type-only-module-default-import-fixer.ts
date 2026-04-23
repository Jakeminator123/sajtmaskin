/**
 * Cross-file type-only-export default-import mismatch fixer.
 *
 * Pattern (empirical, 2026-04-23):
 *
 *   // components/showcase-vehicle.tsx
 *   export type ShowcaseVehicleCard = { make: string };   // ← only a type
 *
 *   // components/showcase-gallery.tsx
 *   import ShowcaseVehicleCard from "@/components/showcase-vehicle"; // ← default (value)
 *
 * The target file exists, but it only `export type X` / `export interface X`
 * — it has no default export (and no runtime value export). TypeScript
 * rejects the default import; Next.js build fails. The existing cross-file
 * checker wouldn't help here because the target file DOES exist.
 *
 * Strategy (conservative):
 * - If the importing file never uses the imported binding as a value
 *   (JSX tag, call, `new`, member access), drop the import entirely.
 *   Letting any still-present type references fall back to the downstream
 *   verifier / LLM-fixer is preferable to rewriting across files when we
 *   can't be sure of the author's intent. (If the name was used purely as
 *   a type, the verifier's `undefined-jsx-symbol` etc. checks will catch
 *   the rest.)
 * - Otherwise leave alone — the LLM may have intended the target file to
 *   export a runtime value too; that's outside the scope of this mechanical
 *   fixer.
 *
 * This complements `value-used-from-type-import-fixer.ts` (same-file) and
 * runs as a cross-file pass, reusing the existing AST helpers.
 */

import ts from "typescript";
import type { CodeFile } from "@/lib/gen/parser";
import { createTsxSourceFile } from "./import-binding-ast";
import { toFixEntries, type FixEntry, type FixEntryDraft } from "../types";

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

function resolveTargetFile(
  fileMap: Map<string, CodeFile>,
  basePath: string,
): CodeFile | null {
  if (fileMap.has(basePath)) return fileMap.get(basePath)!;
  for (const ext of CANDIDATES) {
    const candidate = basePath + ext;
    if (fileMap.has(candidate)) return fileMap.get(candidate)!;
  }
  const srcPrefixed = `src/${basePath}`;
  if (fileMap.has(srcPrefixed)) return fileMap.get(srcPrefixed)!;
  for (const ext of CANDIDATES) {
    const candidate = srcPrefixed + ext;
    if (fileMap.has(candidate)) return fileMap.get(candidate)!;
  }
  return null;
}

/**
 * Return true if the module defined by `file` only exports types / interfaces
 * (no runtime value exports, no default export of a runtime value).
 *
 * Conservative: if we see any `export default` at all, or any
 * `export const/let/var/function/class`, we bail (treat as not-type-only).
 */
function isModuleTypeOnlyExportOnly(file: CodeFile): boolean {
  try {
    const sf = createTsxSourceFile(file.path, file.content);
    let sawRuntimeExport = false;
    let sawTypeExport = false;
    for (const st of sf.statements) {
      // `export default ...` → runtime export
      if (ts.isExportAssignment(st)) {
        sawRuntimeExport = true;
        break;
      }
      // `export function/class/const/let/var` → runtime export
      if (
        ts.isFunctionDeclaration(st) ||
        ts.isClassDeclaration(st) ||
        ts.isVariableStatement(st)
      ) {
        const modifiers = ts.getModifiers(
          st as ts.FunctionDeclaration | ts.ClassDeclaration | ts.VariableStatement,
        );
        const isExported = modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword,
        );
        if (isExported) {
          sawRuntimeExport = true;
          break;
        }
        continue;
      }
      // `export type X` / `export interface X`
      if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) {
        const modifiers = ts.getModifiers(
          st as ts.TypeAliasDeclaration | ts.InterfaceDeclaration,
        );
        const isExported = modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword,
        );
        if (isExported) sawTypeExport = true;
        continue;
      }
      // `export { X }` aggregation — can hide either. Bail conservatively.
      if (ts.isExportDeclaration(st)) {
        sawRuntimeExport = true;
        break;
      }
    }
    return sawTypeExport && !sawRuntimeExport;
  } catch {
    return false;
  }
}

function countValueReferences(code: string, name: string): number {
  const identifierRe = new RegExp(
    `\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`,
    "g",
  );
  let total = 0;
  let match: RegExpExecArray | null;
  while ((match = identifierRe.exec(code)) !== null) {
    const before = code.slice(Math.max(0, match.index - 16), match.index);
    // Skip occurrences inside import/export statements.
    if (/\b(?:import|export)\b[^;]*$/.test(before)) continue;
    // Skip occurrences inside type-alias / interface heads.
    if (/\b(?:type|interface)\s+$/.test(before)) continue;
    // Skip type-position preceders.
    if (/[:,|&?]\s*$|\b(?:as|satisfies|extends|implements|keyof)\s+$/.test(before)) {
      continue;
    }
    total += 1;
  }
  return total;
}

export function fixTypeOnlyModuleDefaultImports(
  files: CodeFile[],
): { files: CodeFile[]; fixes: FixEntry[] } {
  const fileMap = new Map<string, CodeFile>();
  for (const f of files) fileMap.set(f.path, f);

  const fixes: FixEntryDraft[] = [];
  let mutated = false;

  for (const file of files) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;
    if (!file.content.includes("import")) continue;

    const sf = createTsxSourceFile(file.path, file.content);
    const declsToStripDefault = new Set<ts.ImportDeclaration>();

    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st)) continue;
      if (!st.moduleSpecifier || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const spec = st.moduleSpecifier.text;
      if (!isLocalImport(spec)) continue;
      const ic = st.importClause;
      if (!ic?.name) continue; // not a default import
      if (ic.isTypeOnly) continue; // already `import type`, not our case

      const projectPath = normalizeToProjectPath(spec, file.path);
      const target = resolveTargetFile(fileMap, projectPath);
      if (!target) continue;
      if (!isModuleTypeOnlyExportOnly(target)) continue;

      const defaultName = ic.name.text;
      const uses = countValueReferences(file.content, defaultName);
      // If the import is referenced only in type positions (zero value uses),
      // drop the default import. Leaves named imports (if any) intact.
      if (uses === 0) {
        declsToStripDefault.add(st);
      }
    }

    if (declsToStripDefault.size === 0) continue;

    const newStatements: ts.Statement[] = [];
    const removedNames: string[] = [];
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && declsToStripDefault.has(st)) {
        const ic = st.importClause!;
        removedNames.push(ic.name!.text);
        if (!ic.namedBindings) {
          // whole declaration becomes redundant
          continue;
        }
        const newIc = ts.factory.updateImportClause(
          ic,
          ic.isTypeOnly,
          undefined,
          ic.namedBindings,
        );
        newStatements.push(
          ts.factory.updateImportDeclaration(
            st,
            st.modifiers,
            newIc,
            st.moduleSpecifier,
            st.assertClause,
          ),
        );
        continue;
      }
      newStatements.push(st);
    }

    const updated = ts.factory.updateSourceFile(sf, newStatements);
    const printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: false,
    });
    const out = printer.printFile(updated);
    const nextContent = out.endsWith("\n") || file.content.endsWith("\n") ? out : `${out}\n`;
    fileMap.set(file.path, { ...file, content: nextContent });
    mutated = true;
    fixes.push({
      fixer: "type-only-module-default-import-fixer",
      category: "mechanical",
      description: `Dropped default import(s) of type-only module: ${removedNames.join(", ")}`,
      file: file.path,
    });
  }

  if (!mutated) return { files, fixes: [] };
  return { files: Array.from(fileMap.values()), fixes: toFixEntries(fixes, "post_merge") };
}
