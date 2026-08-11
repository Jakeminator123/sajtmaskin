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
 * Only **module-scope** declarations count. A nested `const Button = …` inside a
 * helper must not suppress a missing shadcn import for a top-level `<Button>`.
 *
 * Leaf module on purpose: `import-validator` cannot import from `jsx-checker`
 * without closing the cycle `jsx-checker -> deterministic-import-repair ->
 * import-validator`.
 */

/**
 * Value declarations at the match site: `function Foo(`, `const Foo =`,
 * `const Foo: React.FC<{…}> =`, `let Foo`, `var Foo`.
 * Type annotations may contain nested `<>` / `{}`, so we allow any non-`=`
 * (and non-newline) run between `:` and the `=` / `(`.
 */
const LOCAL_VALUE_DECL_RE =
  /(?:function|const|let|var)\s+([A-Z]\w*)(?:\s*:\s*[^=\n]+)?\s*[=(]/g;

/**
 * Type declarations: `type Foo = …`, `interface Foo`, `class Foo`. Included so a
 * local TS type used in a generic position (`useState<GamePhase>(…)` paired with
 * `type GamePhase = …`) is never mistaken for a missing component import.
 */
const LOCAL_TYPE_DECL_RE = /(?:type|interface|class)\s+([A-Z]\w*)\b/g;

/**
 * Approximate brace depth at `index`, skipping line/block comments and simple
 * string/template literals so `{` inside strings does not inflate depth.
 */
function braceDepthAt(code: string, index: number): number {
  let depth = 0;
  let i = 0;
  while (i < index) {
    const ch = code[i];
    const next = code[i + 1];

    if (ch === "/" && next === "/") {
      i += 2;
      while (i < index && code[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < index && !(code[i] === "*" && code[i + 1] === "/")) i += 1;
      i = Math.min(index, i + 2);
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < index) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === "{") depth += 1;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    i += 1;
  }
  return depth;
}

export function extractLocalComponentDeclarations(code: string): Set<string> {
  const decls = new Set<string>();
  for (const m of code.matchAll(LOCAL_VALUE_DECL_RE)) {
    if (braceDepthAt(code, m.index ?? 0) === 0) {
      decls.add(m[1]);
    }
  }
  for (const m of code.matchAll(LOCAL_TYPE_DECL_RE)) {
    if (braceDepthAt(code, m.index ?? 0) === 0) {
      decls.add(m[1]);
    }
  }
  return decls;
}
