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
 * Declarations are resolved with lexical (brace) scope on a comment-/string-
 * blanked view of the source:
 * - Value bindings (`function`/`const`/`let`/`var`/`class`) suppress imports
 *   only for JSX usages that fall inside that binding's scope.
 * - Type-only bindings (`type`/`interface`) never suppress a runtime import —
 *   they exist only for tag-mismatch / generic false-positive filters.
 *
 * Leaf module on purpose: `import-validator` cannot import from `jsx-checker`
 * without closing the cycle `jsx-checker -> deterministic-import-repair ->
 * import-validator`.
 */

/**
 * Value declarations at the match site: `function Foo(`, `const Foo =`,
 * `const Foo: React.FC<{…}> =`, `let Foo`, `var Foo`, `class Foo`.
 * Type annotations may contain nested `<>` / `{}`, so we allow any non-`=`
 * (and non-newline) run between `:` and the `=` / `(`.
 */
const LOCAL_VALUE_DECL_RE =
  /(?:(?:function|const|let|var)\s+([A-Z]\w*)(?:\s*:\s*[^=\n]+)?\s*[=(]|class\s+([A-Z]\w*)\b)/g;

/**
 * Type-only declarations: `type Foo = …`, `interface Foo`.
 * `class` is a value (runtime constructor), not listed here.
 */
const LOCAL_TYPE_DECL_RE = /(?:type|interface)\s+([A-Z]\w*)\b/g;

interface ValueBinding {
  name: string;
  /** Inclusive start index of the binding. */
  from: number;
  /** Exclusive end index — when the enclosing block closes (or EOF). */
  to: number;
}

/**
 * Replace comments and string/template literals with same-length spaces so
 * regex/brace scans never match inside them. Newlines are preserved.
 */
function blankCommentsAndStrings(source: string): string {
  const out = source.split("");
  let i = 0;
  const n = source.length;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      let j = i + 2;
      while (j < n && source[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (ch === "/" && next === "*") {
      let j = i + 2;
      while (j < n && !(source[j] === "*" && source[j + 1] === "/")) j++;
      j = Math.min(n, j + 2);
      blank(i, j);
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      blank(i, j);
      i = j;
      continue;
    }
    i++;
  }
  return out.join("");
}

type ScopeEvent =
  | { index: number; kind: "open" }
  | { index: number; kind: "close" }
  | { index: number; kind: "decl"; name: string };

/**
 * Build value-binding ranges with lexical brace scope on blanked source.
 */
function collectValueBindings(blanked: string): ValueBinding[] {
  const events: ScopeEvent[] = [];
  for (let i = 0; i < blanked.length; i++) {
    const ch = blanked[i];
    if (ch === "{") events.push({ index: i, kind: "open" });
    else if (ch === "}") events.push({ index: i, kind: "close" });
  }

  LOCAL_VALUE_DECL_RE.lastIndex = 0;
  for (const m of blanked.matchAll(LOCAL_VALUE_DECL_RE)) {
    const name = m[1] ?? m[2];
    if (!name) continue;
    events.push({ index: m.index ?? 0, kind: "decl", name });
  }

  events.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index;
    // At the same index: decls before braces (`function Foo(){`).
    const rank = (e: ScopeEvent) => (e.kind === "decl" ? 0 : e.kind === "open" ? 1 : 2);
    return rank(a) - rank(b);
  });

  const stack: { decls: { name: string; from: number }[] }[] = [{ decls: [] }];
  const bindings: ValueBinding[] = [];

  for (const event of events) {
    if (event.kind === "decl") {
      stack[stack.length - 1]!.decls.push({ name: event.name, from: event.index });
      continue;
    }
    if (event.kind === "open") {
      stack.push({ decls: [] });
      continue;
    }
    // close
    if (stack.length <= 1) {
      // Unbalanced `}` — ignore rather than corrupting module scope.
      continue;
    }
    const frame = stack.pop()!;
    for (const d of frame.decls) {
      bindings.push({ name: d.name, from: d.from, to: event.index });
    }
  }

  // Remaining frames (including module scope) stay open until EOF.
  const eof = blanked.length;
  while (stack.length > 0) {
    const frame = stack.pop()!;
    for (const d of frame.decls) {
      bindings.push({ name: d.name, from: d.from, to: eof });
    }
  }

  return bindings;
}

function collectTypeNames(blanked: string): Set<string> {
  const names = new Set<string>();
  LOCAL_TYPE_DECL_RE.lastIndex = 0;
  for (const m of blanked.matchAll(LOCAL_TYPE_DECL_RE)) {
    names.add(m[1]);
  }
  return names;
}

export interface LocalDeclarationIndex {
  /** True when a runtime value binding named `name` is in scope at `atIndex`. */
  isValueInScope(name: string, atIndex: number): boolean;
  /** Type-only names (`type` / `interface`) anywhere in the file. */
  typeNames: ReadonlySet<string>;
  /**
   * Union of every value name that has at least one binding, plus type names.
   * Used by tag-mismatch filters where a local type in a generic position must
   * not look like a JSX tag. Prefer `isValueInScope` for import decisions.
   */
  allNames: ReadonlySet<string>;
}

/**
 * Build a reusable index for scope-aware local declaration checks.
 */
export function buildLocalDeclarationIndex(code: string): LocalDeclarationIndex {
  const blanked = blankCommentsAndStrings(code);
  const bindings = collectValueBindings(blanked);
  const typeNames = collectTypeNames(blanked);
  const valueNames = new Set(bindings.map((b) => b.name));
  const allNames = new Set<string>([...valueNames, ...typeNames]);

  return {
    isValueInScope(name: string, atIndex: number): boolean {
      for (const b of bindings) {
        if (b.name === name && b.from <= atIndex && atIndex < b.to) return true;
      }
      return false;
    },
    typeNames,
    allNames,
  };
}

/**
 * Back-compat Set: every local value or type name in the file.
 *
 * Prefer `buildLocalDeclarationIndex` + `isValueInScope` when deciding whether
 * a specific JSX usage needs an import — this Set cannot express nested scope.
 */
export function extractLocalComponentDeclarations(code: string): Set<string> {
  return new Set(buildLocalDeclarationIndex(code).allNames);
}
