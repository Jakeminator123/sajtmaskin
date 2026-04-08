/**
 * Deterministic fixer for missing named React hook imports.
 *
 * Only covers built-in hooks exported from the "react" package — never
 * framework hooks (useRouter, usePathname etc.) or custom hooks.
 */

const REACT_HOOKS = new Set([
  "useState",
  "useEffect",
  "useCallback",
  "useMemo",
  "useRef",
  "useContext",
  "useReducer",
  "useTransition",
  "useOptimistic",
  "useId",
  "useDeferredValue",
  "useImperativeHandle",
  "useLayoutEffect",
  "useDebugValue",
  "useSyncExternalStore",
  "useInsertionEffect",
  "useActionState",
  "useFormStatus",
]);

const HOOK_CALL_RE = /\b(use[A-Z]\w*)\s*\(/g;

const REACT_NAMED_IMPORT_RE =
  /import\s+(type\s+)?((?:[\w*$]+\s*,\s*)?)\{([^}]+)\}\s+from\s+["']react["'](;?)/g;

const USE_CLIENT_DIRECTIVE_RE = /^["']use client["'];?\s*\n/;

type ReactNamedImportMatch = {
  full: string;
  start: number;
  end: number;
  typeOnly: boolean;
  defaultPrefix: string;
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

function findReactNamedImports(code: string): ReactNamedImportMatch[] {
  REACT_NAMED_IMPORT_RE.lastIndex = 0;
  const matches: ReactNamedImportMatch[] = [];
  for (const match of code.matchAll(REACT_NAMED_IMPORT_RE)) {
    matches.push({
      full: match[0],
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      typeOnly: Boolean(match[1]),
      defaultPrefix: match[2] ?? "",
      specifiers: parseNamedImportSpecifiers(match[3] ?? ""),
      hasSemicolon: match[4] === ";",
    });
  }
  return matches;
}

function extractNamedReactImports(code: string): Set<string> {
  return new Set(
    findReactNamedImports(code)
      .filter((match) => !match.typeOnly)
      .flatMap((match) => match.specifiers)
      .map(stripTypeAndAlias)
      .filter(Boolean),
  );
}

export function fixReactHookImports(
  code: string,
): { code: string; fixed: boolean; addedHooks: string[] } {
  const usedHooks = new Set<string>();
  HOOK_CALL_RE.lastIndex = 0;
  for (const m of code.matchAll(HOOK_CALL_RE)) {
    if (REACT_HOOKS.has(m[1])) {
      usedHooks.add(m[1]);
    }
  }

  if (usedHooks.size === 0) {
    return { code, fixed: false, addedHooks: [] };
  }

  const alreadyImported = extractNamedReactImports(code);
  const missing = [...usedHooks].filter((h) => !alreadyImported.has(h)).sort();

  if (missing.length === 0) {
    return { code, fixed: false, addedHooks: [] };
  }

  const existingImport = findReactNamedImports(code).find((match) => !match.typeOnly);
  if (existingImport) {
    const existingValueNames = new Set(
      existingImport.specifiers
        .filter((specifier) => !specifier.startsWith("type "))
        .map(stripTypeAndAlias)
        .filter(Boolean),
    );
    const mergedSpecifiers = [...existingImport.specifiers];
    for (const hook of missing) {
      if (!existingValueNames.has(hook)) {
        mergedSpecifiers.push(hook);
      }
    }
    const newImport = `import ${existingImport.defaultPrefix}{ ${mergedSpecifiers.join(", ")} } from "react"${existingImport.hasSemicolon ? ";" : ""}`;
    return {
      code:
        code.slice(0, existingImport.start) +
        newImport +
        code.slice(existingImport.end),
      fixed: true,
      addedHooks: missing,
    };
  }

  const importLine = `import { ${missing.join(", ")} } from "react";\n`;

  const directiveMatch = USE_CLIENT_DIRECTIVE_RE.exec(code);
  if (directiveMatch) {
    const after = directiveMatch[0].length;
    return {
      code: code.slice(0, after) + importLine + code.slice(after),
      fixed: true,
      addedHooks: missing,
    };
  }

  return { code: importLine + code, fixed: true, addedHooks: missing };
}
