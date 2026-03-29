import type { CodeFile } from "@/lib/gen/parser";

type ExportIndex = Map<string, string[]>;

const IMPORT_LINE_RE = /^\s*import\s.+$/gm;
const NAMED_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g;
const DEFAULT_IMPORT_RE = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];?/g;
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
        const key = raw.split(":")[0]?.trim().replace(/\?.*$/, "").trim();
        if (key) names.add(key);
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
