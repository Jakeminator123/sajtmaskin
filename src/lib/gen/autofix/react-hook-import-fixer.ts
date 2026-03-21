const REACT_HOOKS = [
  "useState",
  "useEffect",
  "useContext",
  "useReducer",
  "useCallback",
  "useMemo",
  "useRef",
  "useId",
  "useTransition",
  "useDeferredValue",
  "useLayoutEffect",
  "useInsertionEffect",
  "useImperativeHandle",
  "useDebugValue",
  "useSyncExternalStore",
  "useOptimistic",
  "useActionState",
  "useFormStatus",
  "startTransition",
  "forwardRef",
  "memo",
  "lazy",
  "createContext",
  "Children",
  "cloneElement",
  "isValidElement",
  "createElement",
  "Fragment",
  "Suspense",
] as const;

const HOOK_CALL_RE = new RegExp(
  `\\b(${REACT_HOOKS.join("|")})\\s*[(<]`,
);
const REACT_NAMED_IMPORT_RE =
  /import\s+\{([^}]+)\}\s+from\s+["']react["']/;
const REACT_DEFAULT_IMPORT_RE =
  /import\s+React(?:\s*,\s*\{([^}]*)\})?\s+from\s+["']react["']/;
const USE_CLIENT_DIRECTIVE_RE = /^["']use client["'];?\s*\n/;

function findUsedHooks(code: string): string[] {
  const used: string[] = [];
  for (const hook of REACT_HOOKS) {
    const re = new RegExp(`\\b${hook}\\s*[(<]`);
    if (re.test(code)) {
      used.push(hook);
    }
  }
  return used;
}

function findImportedNames(code: string): Set<string> {
  const names = new Set<string>();
  const namedMatch = code.match(REACT_NAMED_IMPORT_RE);
  if (namedMatch) {
    for (const name of namedMatch[1].split(",")) {
      names.add(name.trim().split(/\s+as\s+/)[0].trim());
    }
  }
  const defaultMatch = code.match(REACT_DEFAULT_IMPORT_RE);
  if (defaultMatch) {
    names.add("React");
    if (defaultMatch[1]) {
      for (const name of defaultMatch[1].split(",")) {
        names.add(name.trim().split(/\s+as\s+/)[0].trim());
      }
    }
  }
  if (names.has("React")) {
    for (const hook of REACT_HOOKS) {
      const dotUsage = new RegExp(`\\bReact\\.${hook}\\b`);
      if (dotUsage.test(code)) {
        names.add(hook);
      }
    }
  }
  return names;
}

export interface HookImportFixResult {
  code: string;
  fixed: boolean;
  addedHooks: string[];
}

export function fixReactHookImports(code: string): HookImportFixResult {
  if (!HOOK_CALL_RE.test(code)) {
    return { code, fixed: false, addedHooks: [] };
  }

  const usedHooks = findUsedHooks(code);
  if (usedHooks.length === 0) {
    return { code, fixed: false, addedHooks: [] };
  }

  const alreadyImported = findImportedNames(code);
  const missing = usedHooks.filter((h) => !alreadyImported.has(h));
  if (missing.length === 0) {
    return { code, fixed: false, addedHooks: [] };
  }

  const namedMatch = code.match(REACT_NAMED_IMPORT_RE);
  if (namedMatch) {
    const existingNames = namedMatch[1]
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const merged = [...new Set([...existingNames, ...missing])].sort();
    const newImport = `import { ${merged.join(", ")} } from "react"`;
    return {
      code: code.replace(REACT_NAMED_IMPORT_RE, newImport),
      fixed: true,
      addedHooks: missing,
    };
  }

  const defaultMatch = code.match(REACT_DEFAULT_IMPORT_RE);
  if (defaultMatch) {
    const existingNamed = defaultMatch[1]
      ? defaultMatch[1]
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
      : [];
    const merged = [...new Set([...existingNamed, ...missing])].sort();
    const newImport = `import React, { ${merged.join(", ")} } from "react"`;
    return {
      code: code.replace(REACT_DEFAULT_IMPORT_RE, newImport),
      fixed: true,
      addedHooks: missing,
    };
  }

  const importLine = `import { ${missing.sort().join(", ")} } from "react";\n`;
  const clientMatch = USE_CLIENT_DIRECTIVE_RE.exec(code);
  if (clientMatch) {
    const after = clientMatch[0].length;
    return {
      code: code.slice(0, after) + importLine + code.slice(after),
      fixed: true,
      addedHooks: missing,
    };
  }

  const firstImportMatch = code.match(/^import\s/m);
  if (firstImportMatch && firstImportMatch.index !== undefined) {
    return {
      code:
        code.slice(0, firstImportMatch.index) +
        importLine +
        code.slice(firstImportMatch.index),
      fixed: true,
      addedHooks: missing,
    };
  }

  return { code: importLine + code, fixed: true, addedHooks: missing };
}

const DOM_GLOBALS = new Set([
  "HTMLFormElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "HTMLButtonElement",
  "HTMLDivElement",
  "HTMLSpanElement",
  "HTMLAnchorElement",
  "HTMLImageElement",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "FormEvent",
  "ChangeEvent",
  "FocusEvent",
  "FormData",
  "Response",
  "Request",
  "URL",
  "Headers",
]);

const LOCAL_IMPORT_RE =
  /import\s+(?:(\w+)(?:\s*,\s*\{[^}]*\})?|\{[^}]*\})\s+from\s+["'](@\/|\.\.?\/)[^"']+["']/g;

export interface ShadowFixResult {
  code: string;
  fixed: boolean;
  removedImports: string[];
}

export function fixDomGlobalShadowing(code: string): ShadowFixResult {
  const removed: string[] = [];
  let result = code;

  let match: RegExpExecArray | null;
  const localDefaultRe = new RegExp(LOCAL_IMPORT_RE.source, "g");
  while ((match = localDefaultRe.exec(code)) !== null) {
    const defaultName = match[1];
    if (defaultName && DOM_GLOBALS.has(defaultName)) {
      const fullImport = match[0];
      result = result.replace(fullImport, `// REMOVED: shadowed DOM global — ${fullImport}`);
      removed.push(defaultName);
    }
  }

  return {
    code: result,
    fixed: removed.length > 0,
    removedImports: removed,
  };
}
