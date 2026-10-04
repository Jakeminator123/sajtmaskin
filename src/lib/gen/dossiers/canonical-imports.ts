import { posix } from "node:path";
import ts from "typescript";

import {
  countParseErrors,
  createTsxSourceFile,
  isGuardablePath,
} from "@/lib/gen/autofix/rules/import-binding-ast";
import type { CodeFile } from "@/lib/gen/parser";
import { resolveLocalImportPath } from "@/lib/gen/preview/utils";
import {
  dossierOutputPathIdentity,
  normalizeDossierProjectPath,
} from "./output-path";

export interface DossierPathRename {
  fromPath: string;
  toPath: string;
}

interface NormalizedRename extends DossierPathRename {
  fromPath: string;
  toPath: string;
  fromIdentity: string;
}

interface TextEdit {
  start: number;
  end: number;
  text: string;
}

const DECLARATION_EXTENSIONS = [".d.mts", ".d.cts", ".d.ts"] as const;
const MODULE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mts", ".cts", ".mjs", ".cjs"] as const;
const MODULE_RESOLUTION_EXTENSIONS = [...DECLARATION_EXTENSIONS, ...MODULE_EXTENSIONS] as const;

function hasTraversalSegment(path: string): boolean {
  return path.split("/").some((segment) => segment === "..");
}

function normalizeRenames(renames: readonly DossierPathRename[]): NormalizedRename[] {
  const byIdentity = new Map<string, NormalizedRename>();
  for (const rename of renames) {
    const fromPath = normalizeDossierProjectPath(rename.fromPath);
    const toPath = normalizeDossierProjectPath(rename.toPath);
    if (!fromPath || !toPath || hasTraversalSegment(fromPath) || hasTraversalSegment(toPath)) {
      throw new Error(
        `[dossiers] import-rewrite-unsafe: invalid rename ${JSON.stringify(rename.fromPath)} -> ${JSON.stringify(rename.toPath)}`,
      );
    }
    if (fromPath === toPath) continue;
    const fromIdentity = dossierOutputPathIdentity(fromPath);
    const normalized = { fromPath, toPath, fromIdentity };
    const previous = byIdentity.get(fromIdentity);
    if (previous && previous.toPath !== toPath) {
      throw new Error(
        `[dossiers] import-rewrite-ambiguous: ${JSON.stringify(previous.fromPath)} and ${JSON.stringify(fromPath)}`,
      );
    }
    byIdentity.set(fromIdentity, normalized);
  }
  return [...byIdentity.values()];
}

function stripModuleExtension(path: string): string | null {
  const lower = path.toLowerCase();
  const extension = MODULE_RESOLUTION_EXTENSIONS.find((candidate) => lower.endsWith(candidate));
  return extension ? path.slice(0, -extension.length) : null;
}

function matchRenameExact(
  resolvedPath: string,
  renames: readonly NormalizedRename[],
): { rename: NormalizedRename; form: "exact" } | null {
  const identity = dossierOutputPathIdentity(resolvedPath);
  const matches = renames.filter((rename) => rename.fromIdentity === identity);
  if (matches.length > 1) {
    throw new Error(`[dossiers] import-rewrite-ambiguous: ${JSON.stringify(resolvedPath)}`);
  }
  return matches.length === 1 ? { rename: matches[0]!, form: "exact" } : null;
}

function matchRenameFuzzy(
  resolvedTarget: string,
  renames: readonly NormalizedRename[],
): { rename: NormalizedRename; form: "exact" | "extensionless" | "indexless" } | null {
  const exact = matchRenameExact(resolvedTarget, renames);
  if (exact) return exact;
  const targetIdentity = dossierOutputPathIdentity(resolvedTarget);

  const extensionless = renames.filter((rename) => {
    const withoutExtension = stripModuleExtension(rename.fromPath);
    return withoutExtension !== null && dossierOutputPathIdentity(withoutExtension) === targetIdentity;
  });
  if (extensionless.length === 1) {
    return { rename: extensionless[0]!, form: "extensionless" };
  }

  const indexless = renames.filter((rename) => {
    const withoutExtension = stripModuleExtension(rename.fromPath);
    return (
      withoutExtension?.toLowerCase().endsWith("/index") === true &&
      dossierOutputPathIdentity(posix.dirname(withoutExtension)) === targetIdentity
    );
  });
  if (indexless.length === 1) return { rename: indexless[0]!, form: "indexless" };

  const ambiguous = [...extensionless, ...indexless];
  if (ambiguous.length > 1) {
    throw new Error(`[dossiers] import-rewrite-ambiguous: ${JSON.stringify(resolvedTarget)}`);
  }
  return null;
}

function projectedTarget(match: NonNullable<ReturnType<typeof matchRenameFuzzy>>): string {
  if (match.form === "exact") return match.rename.toPath;
  const withoutExtension = stripModuleExtension(match.rename.toPath) ?? match.rename.toPath;
  return match.form === "indexless" && withoutExtension.toLowerCase().endsWith("/index")
    ? posix.dirname(withoutExtension)
    : withoutExtension;
}

function projectResolvedTargetWithOriginalForm(
  toPath: string,
  resolvedTarget: string,
  spelledTarget: string,
  allowSrcMirror: boolean,
): string | null {
  const variants: Array<{ fromPath: string; toPath: string }> = [
    { fromPath: resolvedTarget, toPath },
  ];
  if (
    allowSrcMirror &&
    resolvedTarget.startsWith("src/") &&
    toPath.startsWith("src/")
  ) {
    variants.push({ fromPath: resolvedTarget.slice(4), toPath: toPath.slice(4) });
  }
  const spelledIdentity = dossierOutputPathIdentity(spelledTarget);
  for (const variant of variants) {
    if (dossierOutputPathIdentity(variant.fromPath) === spelledIdentity) return variant.toPath;
    const fromWithoutExtension = stripModuleExtension(variant.fromPath);
    if (
      fromWithoutExtension !== null &&
      dossierOutputPathIdentity(fromWithoutExtension) === spelledIdentity
    ) {
      return stripModuleExtension(variant.toPath) ?? variant.toPath;
    }
    if (
      fromWithoutExtension?.toLowerCase().endsWith("/index") === true &&
      dossierOutputPathIdentity(posix.dirname(fromWithoutExtension)) === spelledIdentity
    ) {
      const toWithoutExtension = stripModuleExtension(variant.toPath) ?? variant.toPath;
      return toWithoutExtension.toLowerCase().endsWith("/index")
        ? posix.dirname(toWithoutExtension)
        : toWithoutExtension;
    }
  }
  return null;
}

function resolveLocalSpecifier(specifier: string, importerPath: string): string | null {
  if (specifier.startsWith("@/")) {
    const target = normalizeDossierProjectPath(specifier.slice(2));
    return hasTraversalSegment(target) ? null : target;
  }
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const target = posix.normalize(posix.join(posix.dirname(importerPath), specifier));
  return target === ".." || target.startsWith("../") ? null : normalizeDossierProjectPath(target);
}

function resolveLocalImportPathPortable(
  fileMap: Map<string, CodeFile>,
  importerPath: string,
  specifier: string,
  spelledTarget: string,
): string | null {
  const exact = resolveLocalImportPath(fileMap, importerPath, specifier);
  if (exact !== null) return exact;

  const bases = specifier.startsWith("@/")
    ? [...new Set([spelledTarget, `src/${spelledTarget}`])]
    : [spelledTarget];
  const candidates = bases.flatMap((base) => [
    base,
    ...MODULE_RESOLUTION_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...MODULE_RESOLUTION_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ]);
  const candidateIdentities = new Set(candidates.map(dossierOutputPathIdentity));
  const portableMatches = [...fileMap.keys()].filter((path) =>
    candidateIdentities.has(dossierOutputPathIdentity(path)),
  );
  if (portableMatches.length > 1) {
    throw new Error(
      `[dossiers] import-rewrite-ambiguous: ${JSON.stringify(specifier)} from ${JSON.stringify(importerPath)}`,
    );
  }
  return portableMatches[0] ?? null;
}

function toRelativeSpecifier(targetPath: string, importerPath: string): string {
  const relative = posix.relative(posix.dirname(importerPath), targetPath);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function collectModuleStringLiterals(sourceFile: ts.SourceFile): ts.StringLiteralLike[] {
  const literals: ts.StringLiteralLike[] = [];
  const add = (node: ts.Expression | undefined): void => {
    if (node && ts.isStringLiteralLike(node)) literals.push(node);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport && node.arguments.length >= 1) add(node.arguments[0]);
      if (isRequire && node.arguments.length === 1) add(node.arguments[0]);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return literals;
}

function escapeForQuote(value: string, quote: string): string {
  const escaped = value.replace(/\\/g, "\\\\").split(quote).join(`\\${quote}`);
  return quote === "`" ? escaped.replace(/\$\{/g, "\\${") : escaped;
}

/**
 * Rewrite only verified local module-specifier literals for dossier-owned
 * path renames. Planning is atomic: parse or ambiguity failures leave every
 * caller-owned file object untouched.
 */
export function rewriteDossierImportsForRenames(
  files: readonly CodeFile[],
  renames: readonly DossierPathRename[],
): { files: CodeFile[]; changed: boolean } {
  const normalizedRenames = normalizeRenames(renames);
  if (normalizedRenames.length === 0) return { files: [...files], changed: false };
  const originalFileMap = new Map<string, CodeFile>();
  for (const file of files) originalFileMap.set(normalizeDossierProjectPath(file.path), file);

  const rewritten = files.map((file) => {
    const originalImporter = normalizeDossierProjectPath(file.path);
    if (!isGuardablePath(originalImporter)) return file;
    const importerRename = matchRenameExact(originalImporter, normalizedRenames);
    const canonicalImporter = importerRename?.rename.toPath ?? originalImporter;
    const sourceFile = createTsxSourceFile(originalImporter, file.content);
    const edits: TextEdit[] = [];

    for (const literal of collectModuleStringLiterals(sourceFile)) {
      const specifier = literal.text;
      const spelledTarget = resolveLocalSpecifier(specifier, originalImporter);
      if (spelledTarget === null) continue;
      const exactResolved = resolveLocalImportPathPortable(
        originalFileMap,
        originalImporter,
        specifier,
        spelledTarget,
      );
      const exactMatch = exactResolved
        ? matchRenameExact(exactResolved, normalizedRenames)
        : null;
      const targetRename =
        exactResolved === null ? matchRenameFuzzy(spelledTarget, normalizedRenames) : exactMatch;
      if (!targetRename && canonicalImporter === originalImporter) continue;
      if (
        !targetRename &&
        exactResolved === null &&
        canonicalImporter !== originalImporter &&
        (specifier.startsWith("./") || specifier.startsWith("../"))
      ) {
        throw new Error(
          `[dossiers] import-rewrite-unsafe: cannot resolve ${JSON.stringify(specifier)} from moved importer ${JSON.stringify(file.path)}`,
        );
      }

      const canonicalTarget = targetRename
        ? exactResolved
          ? (projectResolvedTargetWithOriginalForm(
              targetRename.rename.toPath,
              exactResolved,
              spelledTarget,
              specifier.startsWith("@/"),
            ) ?? projectedTarget(targetRename))
          : projectedTarget(targetRename)
        : exactResolved
          ? (projectResolvedTargetWithOriginalForm(
              exactResolved,
              exactResolved,
              spelledTarget,
              false,
            ) ?? spelledTarget)
          : spelledTarget;
      const nextSpecifier = specifier.startsWith("@/")
        ? targetRename
          ? `@/${canonicalTarget}`
          : specifier
        : toRelativeSpecifier(canonicalTarget, canonicalImporter);
      if (nextSpecifier === specifier) continue;
      const quote = file.content[literal.getStart(sourceFile)] ?? '"';
      edits.push({
        start: literal.getStart(sourceFile) + 1,
        end: literal.getEnd() - 1,
        text: escapeForQuote(nextSpecifier, quote),
      });
    }

    if (edits.length === 0) return file;
    if (countParseErrors(file.content, originalImporter) > 0) {
      throw new Error(`[dossiers] import-rewrite-unsafe: ${file.path} does not parse cleanly`);
    }
    let content = file.content;
    for (const edit of edits.sort((left, right) => right.start - left.start)) {
      content = `${content.slice(0, edit.start)}${edit.text}${content.slice(edit.end)}`;
    }
    if (countParseErrors(content, canonicalImporter) > 0) {
      throw new Error(`[dossiers] import-rewrite-unsafe: rewrite broke ${file.path}`);
    }
    return { ...file, content };
  });

  const changed = rewritten.some((file, index) => file !== files[index]);
  return changed ? { files: rewritten, changed: true } : { files: [...files], changed: false };
}
