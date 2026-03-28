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
  /import\s+\{([^}]+)\}\s+from\s+["']react["']/;

const USE_CLIENT_DIRECTIVE_RE = /^["']use client["'];?\s*\n/;

function extractNamedReactImports(code: string): Set<string> {
  const match = code.match(REACT_NAMED_IMPORT_RE);
  if (!match) return new Set();
  return new Set(
    match[1]
      .split(",")
      .map((s) => s.replace(/\s+as\s+\w+/, "").trim())
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

  const existingMatch = code.match(REACT_NAMED_IMPORT_RE);
  if (existingMatch) {
    const currentNames = existingMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = [...new Set([...currentNames, ...missing])].sort();
    const newImport = `import { ${merged.join(", ")} } from "react"`;
    return {
      code: code.replace(existingMatch[0], newImport),
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
