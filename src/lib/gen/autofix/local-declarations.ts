/**
 * Local component/type declarations in one file, keyed by PascalCase name.
 *
 * Shared by every fixer that decides whether a `<Name>` in JSX needs an import:
 * a name the file itself declares must never be "fixed" by importing it, least
 * of all from the file's own module path. `jsx-checker` and `common-import-fixer`
 * have always applied that guard; `import-validator` did not, and injected a
 * self-import (`import { DialogPortal } from "@/components/ui/dialog"` INTO
 * `components/ui/dialog.tsx`) that the conflict fixer then removed again — an
 * add/remove cycle that stacked blank lines on every pass (prod chat f98fd5c0).
 *
 * Leaf module on purpose: `import-validator` cannot import from `jsx-checker`
 * without closing the cycle `jsx-checker -> deterministic-import-repair ->
 * import-validator`.
 */

/**
 * Value declarations: `function Foo(`, `const Foo =`, `let Foo`, `var Foo`.
 */
const LOCAL_VALUE_DECL_RE = /(?:function|const|let|var)\s+([A-Z]\w*)\s*[=(]/g;

/**
 * Type declarations: `type Foo = …`, `interface Foo`, `class Foo`. Included so a
 * local TS type used in a generic position (`useState<GamePhase>(…)` paired with
 * `type GamePhase = …`) is never mistaken for a missing component import.
 */
const LOCAL_TYPE_DECL_RE = /(?:type|interface|class)\s+([A-Z]\w*)\b/g;

export function extractLocalComponentDeclarations(code: string): Set<string> {
  const decls = new Set<string>();
  for (const m of code.matchAll(LOCAL_VALUE_DECL_RE)) {
    decls.add(m[1]);
  }
  for (const m of code.matchAll(LOCAL_TYPE_DECL_RE)) {
    decls.add(m[1]);
  }
  return decls;
}
