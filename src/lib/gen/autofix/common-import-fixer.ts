import type { CodeFile } from "@/lib/gen/parser";
import { normalizeFilePath, resolveLocalImportPath } from "@/lib/gen/preview/utils";

type ExportIndex = Map<string, string[]>;
type ModuleExportIndex = Map<string, { named: Set<string>; hasDefault: boolean; defaultName: string | null }>;

const IMPORT_LINE_RE = /^\s*import\s.+$/gm;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findLastImportIndex(lines: string[]): number {
  let last = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*import\s/.test(lines[index])) last = index;
  }
  return last;
}

function insertImportAfterDirectives(code: string, importLine: string): string {
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

function isEligibleSharedSymbol(name: string): boolean {
  if (/^[A-Z][A-Z0-9_]*$/.test(name)) return true;
  return /^[a-z][A-Za-z0-9]*$/.test(name);
}

function isSharedDataFile(path: string): boolean {
  return /(^|\/)(lib|data)\//.test(path.replace(/\\/g, "/"));
}

function toAliasImportPath(path: string): string {
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
  return patterns.some((pattern) => pattern.test(code));
}

function addNamedImport(code: string, importPath: string, names: string[]): string {
  const importLine = `import { ${names.join(", ")} } from "${importPath}";`;
  const samePathNamedImport = new RegExp(
    `import\\s+(?:type\\s+)?\\{([^}]+)\\}\\s+from\\s+["']${escapeRegExp(importPath)}["'];?`,
  );
  const match = code.match(samePathNamedImport);
  if (match) {
    const merged = [...new Set([...parseImportNames(match[1]), ...names])].sort();
    return code.replace(match[0], `import { ${merged.join(", ")} } from "${importPath}";`);
  }
  return insertImportAfterDirectives(code, importLine);
}

export function buildProjectExportIndex(files: CodeFile[]): ExportIndex {
  const index = new Map<string, string[]>();

  for (const file of files) {
    if (!/\.(tsx?|jsx?)$/i.test(file.path)) continue;
    if (!isSharedDataFile(file.path)) continue;

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

export function fixMissingLocalSymbolImports(
  code: string,
  filePath: string,
  exportIndex: ExportIndex,
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
    nextCode = addNamedImport(nextCode, importPath, uniqueNames);
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

export function fixImportedDeclarationConflicts(
  code: string,
): { code: string; fixed: boolean; removedBindings: string[] } {
  const declarations = extractLocalDeclarations(code);
  if (declarations.size === 0) {
    return { code, fixed: false, removedBindings: [] };
  }

  const removedBindings: string[] = [];
  let nextCode = code;

  nextCode = nextCode.replace(LOCAL_DEFAULT_IMPORT_LINE_RE, (full, prefix, defaultLocal, namedPart, namedSpecs, source) => {
    const defaultConflicts = declarations.has(defaultLocal);
    const namedSpecsParsed = parseNamedImportSpecifiersDetailed(namedSpecs ?? "");
    const keptNamed = namedSpecsParsed.filter((spec) => {
      const shouldDrop = declarations.has(spec.local);
      if (shouldDrop) removedBindings.push(spec.local);
      return !shouldDrop;
    });

    if (defaultConflicts) {
      removedBindings.push(defaultLocal);
    }

    if (defaultConflicts && keptNamed.length === 0) {
      return "";
    }
    if (defaultConflicts) {
      return `${prefix}{ ${keptNamed.map(formatNamedImportSpecifier).join(", ")} } from "${source}";`;
    }
    if ((namedSpecsParsed.length > 0 || namedPart) && keptNamed.length !== namedSpecsParsed.length) {
      return `${prefix}${defaultLocal}, { ${keptNamed.map(formatNamedImportSpecifier).join(", ")} } from "${source}";`;
    }
    return full;
  });

  nextCode = nextCode.replace(LOCAL_NAMED_IMPORT_LINE_RE, (full, prefix, specifiers, source) => {
    const namedSpecsParsed = parseNamedImportSpecifiersDetailed(specifiers ?? "");
    const keptNamed = namedSpecsParsed.filter((spec) => {
      const shouldDrop = declarations.has(spec.local);
      if (shouldDrop) removedBindings.push(spec.local);
      return !shouldDrop;
    });
    if (keptNamed.length === namedSpecsParsed.length) return full;
    if (keptNamed.length === 0) return "";
    return `${prefix}{ ${keptNamed.map(formatNamedImportSpecifier).join(", ")} } from "${source}";`;
  });

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
