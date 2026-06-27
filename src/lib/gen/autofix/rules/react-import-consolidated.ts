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

// ── React import consolidation (TS2300 duplicate-identifier guard) ──────────
//
// When a file ends up with 2+ `import ... from "react"` statements that
// re-declare the same local name — a mix of `import type { ReactNode }` + a
// value `import { useState }`, or an inline `type ReactNode` duplicated across
// statements — TypeScript fails with TS2300 "Duplicate identifier". This merges
// the react imports into a single value import (+ a single `import type` when
// the file uses type-only react imports), de-duplicating specifiers, BEFORE the
// add-missing passes below run. Empirical hit: a generated `three-canvas-shell`
// error-boundary file with three overlapping react imports survived to tsc.

interface ReactSpec {
  imported: string;
  local: string;
  isType: boolean;
}

interface ParsedReactImport {
  default?: string;
  namespace?: string;
  isTypeOnly: boolean;
  specs: ReactSpec[];
}

// A SINGLE-LINE `import ... from "react"`. Anchored to the whole line so partial
// / multiline react imports are skipped (left untouched = safe). ASCII-only —
// no unicode property escapes (keeps `check-unicode-regex` green).
const REACT_IMPORT_LINE_RE =
  /^(\s*)import\s+(type\s+)?(.+?)\s+from\s+["']react["']\s*;?\s*$/;

function parseReactSpecifier(raw: string, typeOnlyImport: boolean): ReactSpec | null {
  let isType = typeOnlyImport;
  let body = raw.trim();
  if (/^type\s+/.test(body)) {
    isType = true;
    body = body.replace(/^type\s+/, "").trim();
  }
  const asMatch = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(body);
  if (asMatch) return { imported: asMatch[1], local: asMatch[2], isType };
  if (/^[\w$]+$/.test(body)) return { imported: body, local: body, isType };
  return null;
}

function parseReactImportClause(clause: string, typeOnly: boolean): ParsedReactImport | null {
  const trimmed = clause.trim();
  if (/^\*\s+as\s+[\w$]+$/.test(trimmed)) {
    return {
      namespace: trimmed.replace(/^\*\s+as\s+/, "").trim(),
      isTypeOnly: typeOnly,
      specs: [],
    };
  }
  const braceIdx = trimmed.indexOf("{");
  if (braceIdx === -1) {
    if (!/^[\w$]+$/.test(trimmed)) return null;
    return { default: trimmed, isTypeOnly: typeOnly, specs: [] };
  }
  let defaultName: string | undefined;
  const before = trimmed.slice(0, braceIdx).replace(/,\s*$/, "").trim();
  if (before) {
    if (!/^[\w$]+$/.test(before)) return null;
    defaultName = before;
  }
  const closeIdx = trimmed.lastIndexOf("}");
  if (closeIdx < braceIdx) return null;
  if (trimmed.slice(closeIdx + 1).trim()) return null;
  const specs: ReactSpec[] = [];
  for (const part of trimmed.slice(braceIdx + 1, closeIdx).split(",")) {
    if (!part.trim()) continue;
    const spec = parseReactSpecifier(part, typeOnly);
    if (!spec) return null;
    specs.push(spec);
  }
  return { default: defaultName, isTypeOnly: typeOnly, specs };
}

function formatReactSpecifier(spec: ReactSpec): string {
  return spec.imported === spec.local ? spec.imported : `${spec.imported} as ${spec.local}`;
}

/**
 * Merge duplicate single-line `react` imports. Only fires when an actual
 * duplicate local name exists across the react imports, so legitimate pairs
 * such as `import React from "react"` + `import { useState } from "react"`
 * stay untouched and the transform is idempotent. Bails (no-op) on namespace
 * react imports or any specifier it cannot confidently parse, so it can never
 * emit broken syntax. Returns the de-duplicated local names for telemetry.
 */
function consolidateReactImports(code: string): { code: string; deduped: string[] } {
  const lines = code.split("\n");
  const reactIdx: number[] = [];
  const parsed: ParsedReactImport[] = [];
  let indent = "";

  for (let i = 0; i < lines.length; i += 1) {
    const m = REACT_IMPORT_LINE_RE.exec(lines[i]);
    if (!m) continue;
    const p = parseReactImportClause(m[3], Boolean(m[2]));
    if (!p) return { code, deduped: [] };
    if (reactIdx.length === 0) indent = m[1] ?? "";
    reactIdx.push(i);
    parsed.push(p);
  }

  if (reactIdx.length < 2) return { code, deduped: [] };
  // Namespace (`import * as React`) cannot be merged into a named import list
  // without producing invalid syntax — leave the file untouched.
  if (parsed.some((p) => p.namespace)) return { code, deduped: [] };

  const localCount = new Map<string, number>();
  for (const p of parsed) {
    if (p.default) localCount.set(p.default, (localCount.get(p.default) ?? 0) + 1);
    for (const s of p.specs) localCount.set(s.local, (localCount.get(s.local) ?? 0) + 1);
  }
  const deduped = [...localCount.entries()]
    .filter(([, count]) => count >= 2)
    .map(([name]) => name)
    .sort();
  if (deduped.length === 0) return { code, deduped: [] };

  let defaultName: string | undefined;
  const valueOrder: string[] = [];
  const typeOrder: string[] = [];
  const valueByLocal = new Map<string, ReactSpec>();
  const typeByLocal = new Map<string, ReactSpec>();

  for (const p of parsed) {
    if (p.default && !defaultName) defaultName = p.default;
    for (const s of p.specs) {
      if (s.isType) {
        if (!valueByLocal.has(s.local) && !typeByLocal.has(s.local)) {
          typeByLocal.set(s.local, s);
          typeOrder.push(s.local);
        }
      } else if (!valueByLocal.has(s.local)) {
        valueByLocal.set(s.local, s);
        valueOrder.push(s.local);
        // A name used as a value wins over a type-only occurrence elsewhere
        // (a value import already satisfies type positions).
        if (typeByLocal.has(s.local)) {
          typeByLocal.delete(s.local);
          const idx = typeOrder.indexOf(s.local);
          if (idx >= 0) typeOrder.splice(idx, 1);
        }
      }
    }
  }

  const valueParts = valueOrder.map((n) => formatReactSpecifier(valueByLocal.get(n)!));
  const typeParts = typeOrder.map((n) => formatReactSpecifier(typeByLocal.get(n)!));

  const block: string[] = [];
  if (defaultName && valueParts.length > 0) {
    block.push(`${indent}import ${defaultName}, { ${valueParts.join(", ")} } from "react";`);
  } else if (defaultName) {
    block.push(`${indent}import ${defaultName} from "react";`);
  } else if (valueParts.length > 0) {
    block.push(`${indent}import { ${valueParts.join(", ")} } from "react";`);
  }
  if (typeParts.length > 0) {
    // Always a dedicated `import type` line — valid whether or not the file
    // originally separated type imports, and avoids inline-`type` edge cases.
    block.push(`${indent}import type { ${typeParts.join(", ")} } from "react";`);
  }
  if (block.length === 0) return { code, deduped: [] };

  const removeRest = new Set(reactIdx.slice(1));
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i === reactIdx[0]) out.push(block.join("\n"));
    else if (removeRest.has(i)) continue;
    else out.push(lines[i]);
  }
  return { code: out.join("\n"), deduped };
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
  /** Local names de-duplicated when merging multiple `react` imports (TS2300). */
  consolidatedReactBindings: string[];
}

export function fixReactAndNavigationImports(code: string): ReactAndNavigationFixResult {
  let current = code;

  // 0. Consolidate duplicate `react` imports FIRST so the add-missing passes
  //    below see a single, de-duplicated react import block. Prevents TS2300
  //    when the file has overlapping `import type {…}` / value `import {…}`
  //    statements. No-op unless a duplicate local name actually exists.
  const consolidation = consolidateReactImports(current);
  current = consolidation.code;
  const consolidatedReactBindings = consolidation.deduped;

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
    consolidatedReactBindings.length > 0 ||
    addedReactDefault ||
    missingHooks.length > 0 ||
    missingNav.length > 0;

  return {
    code: current,
    fixed,
    addedReactDefault,
    addedReactHooks: missingHooks,
    addedNavigationSymbols: missingNav,
    consolidatedReactBindings,
  };
}
