/**
 * E5 (OMTAG fas 2·C) — Consolidated React + next/navigation import fixer.
 *
 * Replaces three separate fixers with one shared implementation:
 *   - `react-import-fixer`         (default `import React from "react"`)
 *   - `react-hook-import-fixer`    (named React hooks: `useState`, …)
 *   - `nextjs-navigation-import-fixer` (named next/navigation symbols)
 *
 * The three flavors share ~90% of their logic (find an existing named
 * import block for a module source, merge missing specifiers in, or
 * inject a fresh `import { … } from "…"` line after any `"use client"`
 * directive). Keeping three files meant the merging logic had been
 * hand-forked three times — any bug discovered in one (e.g. default-
 * plus-named merging, type-only import coexistence) had to be backported
 * to the others. Telemetry shows they fire on different files per run
 * but share target sites more often than not.
 *
 * The single public entry point `fixReactAndNavigationImports` returns a
 * structured result with one flag per flavor so `pipeline.ts` can keep
 * emitting three distinct `FixEntry`s (one per flavor that fired). That
 * preserves the stable fixer-ID surface used by telemetry, the fixer
 * registry, and backoffice dashboards.
 */

// ── Shared regex ──────────────────────────────────────────────────────────

const USE_CLIENT_DIRECTIVE_RE = /^["']use client["'];?\s*\n/;

// Default-React usage — any bare `React.` reference where no default/namespace
// React import is present yet.
const REACT_DOT_RE = /\bReact\./;
const REACT_DEFAULT_IMPORT_RE = /\bimport\s+(?:React|\*\s+as\s+React)\b/;

// Named React hook calls (`useState(`, `useEffect(`, …) that must resolve
// to specifiers from the `react` package.
const HOOK_CALL_RE = /\b(use[A-Z]\w*)\s*\(/g;

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

// Named `next/navigation` symbols. Bare function calls to these without an
// import yield ReferenceError at SSR → preview-VM 500.
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

// Broader identifier-call regex used for navigation symbols (they are not
// restricted to the `use*` prefix — e.g. `redirect`, `notFound`).
const SYMBOL_CALL_RE = /\b([A-Za-z_$][\w$]*)\s*\(/g;

// Per-module named-import matcher (scoped to the module source so we merge
// into the correct block).
function namedImportReFor(modulePath: string): RegExp {
  // `import [type ][<default>, ]{ … } from "modulePath"[;]`
  const escaped = modulePath.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
  return new RegExp(
    `import\\s+(type\\s+)?((?:[\\w*$]+\\s*,\\s*)?)\\{([^}]+)\\}\\s+from\\s+["']${escaped}["'](;?)`,
    "g",
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────

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

interface NamedImportMatch {
  start: number;
  end: number;
  typeOnly: boolean;
  defaultPrefix: string;
  specifiers: string[];
  hasSemicolon: boolean;
}

function findNamedImportsFor(code: string, modulePath: string): NamedImportMatch[] {
  const re = namedImportReFor(modulePath);
  const out: NamedImportMatch[] = [];
  for (const match of code.matchAll(re)) {
    out.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      typeOnly: Boolean(match[1]),
      defaultPrefix: match[2] ?? "",
      specifiers: parseNamedImportSpecifiers(match[3] ?? ""),
      hasSemicolon: match[4] === ";",
    });
  }
  return out;
}

function extractAlreadyImported(code: string, modulePath: string): Set<string> {
  return new Set(
    findNamedImportsFor(code, modulePath)
      .filter((match) => !match.typeOnly)
      .flatMap((match) => match.specifiers)
      .map(stripTypeAndAlias)
      .filter(Boolean),
  );
}

/**
 * Merge the given missing specifiers into an existing value-import block
 * for `modulePath`, or inject a fresh `import { … } from "modulePath"` line
 * after any `"use client"` directive.
 */
function mergeOrInjectImport(
  code: string,
  modulePath: string,
  missing: string[],
): string {
  if (missing.length === 0) return code;
  const sorted = [...missing].sort();

  const existing = findNamedImportsFor(code, modulePath).find((match) => !match.typeOnly);
  if (existing) {
    const existingValueNames = new Set(
      existing.specifiers
        .filter((specifier) => !specifier.startsWith("type "))
        .map(stripTypeAndAlias)
        .filter(Boolean),
    );
    const merged = [...existing.specifiers];
    for (const symbol of sorted) {
      if (!existingValueNames.has(symbol)) merged.push(symbol);
    }
    const rebuilt = `import ${existing.defaultPrefix}{ ${merged.join(", ")} } from "${modulePath}"${existing.hasSemicolon ? ";" : ""}`;
    return code.slice(0, existing.start) + rebuilt + code.slice(existing.end);
  }

  const importLine = `import { ${sorted.join(", ")} } from "${modulePath}";\n`;
  const directive = USE_CLIENT_DIRECTIVE_RE.exec(code);
  if (directive) {
    const after = directive[0].length;
    return code.slice(0, after) + importLine + code.slice(after);
  }
  return importLine + code;
}

// ── Per-flavor detectors ──────────────────────────────────────────────────

function detectReactDefaultNeed(code: string): boolean {
  if (!REACT_DOT_RE.test(code)) return false;
  if (REACT_DEFAULT_IMPORT_RE.test(code)) return false;
  return true;
}

function injectDefaultReactImport(code: string): string {
  const importLine = 'import React from "react";\n';
  const directive = USE_CLIENT_DIRECTIVE_RE.exec(code);
  if (directive) {
    const after = directive[0].length;
    return code.slice(0, after) + importLine + code.slice(after);
  }
  return importLine + code;
}

function collectMissingReactHooks(code: string): string[] {
  const used = new Set<string>();
  HOOK_CALL_RE.lastIndex = 0;
  for (const m of code.matchAll(HOOK_CALL_RE)) {
    if (REACT_HOOKS.has(m[1])) used.add(m[1]);
  }
  if (used.size === 0) return [];
  const already = extractAlreadyImported(code, "react");
  return [...used].filter((h) => !already.has(h)).sort();
}

function collectMissingNavigationSymbols(code: string): string[] {
  const used = new Set<string>();
  SYMBOL_CALL_RE.lastIndex = 0;
  for (const m of code.matchAll(SYMBOL_CALL_RE)) {
    if (NAVIGATION_SYMBOLS.has(m[1])) used.add(m[1]);
  }
  if (used.size === 0) return [];
  const already = extractAlreadyImported(code, "next/navigation");
  return [...used].filter((s) => !already.has(s)).sort();
}

// ── Public API ────────────────────────────────────────────────────────────

export interface ReactAndNavigationFixResult {
  code: string;
  fixed: boolean;
  /** True when `import React from "react"` was injected. */
  addedReactDefault: boolean;
  /** Named React hook specifiers that were added (e.g. ["useState", "useEffect"]). */
  addedReactHooks: string[];
  /** next/navigation specifiers that were added (e.g. ["useRouter", "usePathname"]). */
  addedNavigationSymbols: string[];
}

export function fixReactAndNavigationImports(code: string): ReactAndNavigationFixResult {
  let current = code;

  // 1. React default — do this first so a subsequent React-hook injection
  //    can merge into an existing `import React from "react"` block if the
  //    user had it already. Keeping insertion order consistent with the
  //    legacy pipeline (default → named → navigation).
  let addedReactDefault = false;
  if (detectReactDefaultNeed(current)) {
    current = injectDefaultReactImport(current);
    addedReactDefault = true;
  }

  // 2. Named React hooks.
  const missingHooks = collectMissingReactHooks(current);
  if (missingHooks.length > 0) {
    current = mergeOrInjectImport(current, "react", missingHooks);
  }

  // 3. next/navigation symbols.
  const missingNav = collectMissingNavigationSymbols(current);
  if (missingNav.length > 0) {
    current = mergeOrInjectImport(current, "next/navigation", missingNav);
  }

  const fixed =
    addedReactDefault || missingHooks.length > 0 || missingNav.length > 0;

  return {
    code: current,
    fixed,
    addedReactDefault,
    addedReactHooks: missingHooks,
    addedNavigationSymbols: missingNav,
  };
}
