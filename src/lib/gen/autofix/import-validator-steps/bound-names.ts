// Whole-text import-binding regexes. Unlike the per-line scans below these
// span MULTI-LINE named-import blocks (`import {\n  Flame,\n} from
// "lucide-react"`), whose bindings the line-based scans cannot see.
// Prod incident 2026-07-03 (chat cc10e7de v8, M#imp1): `app/page.tsx` had a
// multi-line lucide import; `fixMissingIconValueImports` did not see those
// bindings, re-imported six icons, and the guarded wrapper then reverted the
// ENTIRE import-validator result — silently discarding the correct
// `Badge`/`Button` shadcn fixes that `detectMissingImports` had just added.
const NAMED_IMPORT_STATEMENT_RE =
  /^[ \t]*import\s+(type\s+)?(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s*["'][^"']+["']/gm;
const DEFAULT_IMPORT_STATEMENT_RE =
  /^[ \t]*import\s+(type\s+)?([A-Za-z_$][\w$]*)\s*(?:,|from)\s/gm;
const NAMESPACE_IMPORT_STATEMENT_RE =
  /^[ \t]*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s/gm;

/**
 * Names bound by import statements across the whole file, split into VALUE
 * and TYPE-ONLY bindings. Multi-line aware (see the regex comment above).
 * Canonical "already imported?" collector: consumed by this module's JSX-tag
 * scan (`detectMissingImports`) and icon-value scan
 * (`fixMissingIconValueImports`), AND by the diagnostic-driven
 * `ts2304-known-import-fixer` (bugbot HIGH on PR #378: its own line-based
 * scan re-injected names bound in multi-line import blocks — same M#imp1
 * guard-revert class). ONE shared implementation on purpose; do not fork.
 */
export function collectImportBoundNames(code: string): {
  value: Set<string>;
  typeOnly: Set<string>;
} {
  const value = new Set<string>();
  const typeOnly = new Set<string>();

  NAMED_IMPORT_STATEMENT_RE.lastIndex = 0;
  for (const match of code.matchAll(NAMED_IMPORT_STATEMENT_RE)) {
    const statementIsTypeOnly = Boolean(match[1]);
    for (const rawSpec of match[2].split(",")) {
      let spec = rawSpec.trim();
      if (!spec) continue;
      const specIsTypeOnly = /^type\s+/.test(spec);
      if (specIsTypeOnly) spec = spec.replace(/^type\s+/, "");
      const aliased = spec.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
      const bound = aliased ? aliased[2] : spec;
      if (!/^[A-Za-z_$][\w$]*$/.test(bound)) continue;
      if (statementIsTypeOnly || specIsTypeOnly) typeOnly.add(bound);
      else value.add(bound);
    }
  }

  DEFAULT_IMPORT_STATEMENT_RE.lastIndex = 0;
  for (const match of code.matchAll(DEFAULT_IMPORT_STATEMENT_RE)) {
    if (match[1]) typeOnly.add(match[2]);
    else value.add(match[2]);
  }

  NAMESPACE_IMPORT_STATEMENT_RE.lastIndex = 0;
  for (const match of code.matchAll(NAMESPACE_IMPORT_STATEMENT_RE)) {
    value.add(match[1]);
  }

  return { value, typeOnly };
}
