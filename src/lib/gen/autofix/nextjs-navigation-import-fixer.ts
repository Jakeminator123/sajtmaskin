/**
 * Deterministic fixer for missing named `next/navigation` imports.
 *
 * Mirrors `react-hook-import-fixer` but covers App Router navigation
 * primitives. The model often calls `usePathname()`/`useRouter()` from
 * client components without ever importing them, which yields a
 * `ReferenceError` at SSR time and a 500 in the preview VM (whiteout).
 * `import-validator` only completes module sources for symbols that are
 * already in an import block, so a bare function call slips through it.
 *
 * Scope: ONLY symbols exported from `next/navigation`. Any other hook
 * (third-party libs, custom hooks) is intentionally ignored — same
 * conservative posture as `react-hook-import-fixer`.
 */

const NAVIGATION_SYMBOLS = new Set([
  "useRouter",
  "usePathname",
  "useSearchParams",
  "useParams",
  "useSelectedLayoutSegment",
  "useSelectedLayoutSegments",
  "redirect",
  "permanentRedirect",
  "notFound",
]);

const SYMBOL_USE_RE = /\b([A-Za-z_$][\w$]*)\s*\(/g;

const NAVIGATION_NAMED_IMPORT_RE =
  /import\s+(type\s+)?\{([^}]+)\}\s+from\s+["']next\/navigation["'](;?)/g;

const USE_CLIENT_DIRECTIVE_RE = /^["']use client["'];?\s*\n/;

type NavigationNamedImportMatch = {
  full: string;
  start: number;
  end: number;
  typeOnly: boolean;
  specifiers: string[];
  hasSemicolon: boolean;
};

function parseNamedImportSpecifiers(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripTypeAndAlias(specifier: string): string {
  return specifier
    .replace(/^type\s+/, "")
    .replace(/\s+as\s+\w+$/, "")
    .trim();
}

function findNavigationNamedImports(code: string): NavigationNamedImportMatch[] {
  NAVIGATION_NAMED_IMPORT_RE.lastIndex = 0;
  const matches: NavigationNamedImportMatch[] = [];
  for (const match of code.matchAll(NAVIGATION_NAMED_IMPORT_RE)) {
    matches.push({
      full: match[0],
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      typeOnly: Boolean(match[1]),
      specifiers: parseNamedImportSpecifiers(match[2] ?? ""),
      hasSemicolon: match[3] === ";",
    });
  }
  return matches;
}

function extractNamedNavigationImports(code: string): Set<string> {
  return new Set(
    findNavigationNamedImports(code)
      .filter((match) => !match.typeOnly)
      .flatMap((match) => match.specifiers)
      .map(stripTypeAndAlias)
      .filter(Boolean),
  );
}

function collectUsedNavigationSymbols(code: string): Set<string> {
  const used = new Set<string>();
  SYMBOL_USE_RE.lastIndex = 0;
  for (const m of code.matchAll(SYMBOL_USE_RE)) {
    if (NAVIGATION_SYMBOLS.has(m[1])) {
      used.add(m[1]);
    }
  }
  return used;
}

export function fixNextNavigationImports(
  code: string,
): { code: string; fixed: boolean; addedSymbols: string[] } {
  const used = collectUsedNavigationSymbols(code);

  if (used.size === 0) {
    return { code, fixed: false, addedSymbols: [] };
  }

  const alreadyImported = extractNamedNavigationImports(code);
  const missing = [...used].filter((s) => !alreadyImported.has(s)).sort();

  if (missing.length === 0) {
    return { code, fixed: false, addedSymbols: [] };
  }

  const existingImport = findNavigationNamedImports(code).find(
    (match) => !match.typeOnly,
  );
  if (existingImport) {
    const existingValueNames = new Set(
      existingImport.specifiers
        .filter((specifier) => !specifier.startsWith("type "))
        .map(stripTypeAndAlias)
        .filter(Boolean),
    );
    const mergedSpecifiers = [...existingImport.specifiers];
    for (const symbol of missing) {
      if (!existingValueNames.has(symbol)) {
        mergedSpecifiers.push(symbol);
      }
    }
    const newImport = `import { ${mergedSpecifiers.join(", ")} } from "next/navigation"${existingImport.hasSemicolon ? ";" : ""}`;
    return {
      code:
        code.slice(0, existingImport.start) +
        newImport +
        code.slice(existingImport.end),
      fixed: true,
      addedSymbols: missing,
    };
  }

  const importLine = `import { ${missing.join(", ")} } from "next/navigation";\n`;

  const directiveMatch = USE_CLIENT_DIRECTIVE_RE.exec(code);
  if (directiveMatch) {
    const after = directiveMatch[0].length;
    return {
      code: code.slice(0, after) + importLine + code.slice(after),
      fixed: true,
      addedSymbols: missing,
    };
  }

  return { code: importLine + code, fixed: true, addedSymbols: missing };
}
