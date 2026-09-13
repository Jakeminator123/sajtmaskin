/**
 * Mechanical fixer: replace raw `item.icon` JSX usage (a Lucide component
 * reference used as a React key or rendered as a bare JSX child) with a
 * stable, render-safe form that handles both string icon names and component
 * references.
 *
 * Extracted from `src/lib/gen/autofix/pipeline.ts` 2026-04-21.
 *
 * 2026-09-11 — scope narrowed after a prod incident (chat `5d809cc1`,
 * ecommerce/megastore-clean). The child rewrite used to match `{x.icon}`
 * ANYWHERE, including inside an attribute such as `name={product.icon}`. The
 * model's `<ProductIcon name={product.icon} />` (icon typed `string`) was
 * rewritten into `name={typeof product.icon === "string" ? product.icon :
 * <product.icon />}`, which yields `string | JSX.Element` for a `string` prop
 * (TS2322), narrows the else branch to `never` (TS2339) and tries to render a
 * string literal as an element type (TS2604). Preview still rendered (runtime
 * takes the string branch), but `next build` on Vercel failed on exactly those
 * four diagnostics. The fixer had introduced the bug it was meant to prevent.
 *
 * Three guards now bound the rewrite:
 *  - Only a bare JSX CHILD is rewritten: `{x.icon}` directly after a `>` or
 *    alone at the start of a line. Attribute values (`prop={x.icon}`) and
 *    nested expressions are never touched.
 *  - Evidence is resolved PER BINDING, not per file. For `{x.icon}` inside
 *    `arr.map((x) => …)` the fixer looks at `arr`'s own literal: rewrite only
 *    if that literal holds component icons and no string icons. A file that
 *    mixes `products` (string icons) with `features` (component icons) thus
 *    rewrites `{feature.icon}` and leaves `{product.icon}` alone.
 *  - When the binding cannot be resolved (prop, import, non-literal), the file
 *    as a whole must show component-icon evidence AND no string-icon evidence.
 *    A mixed file falls back to no-op — the type checker and the repair loop
 *    own that case; a wrong ternary would only add TS2322/TS2604.
 *
 * The `key={x.icon}` rewrite is unchanged: both ternary branches are strings,
 * so it is type-safe regardless of what `icon` holds.
 */

import type { FixEntry } from "../types";

const ICON_KEY_RE = /key=\{([A-Za-z_$][\w$]*)\.icon\}/g;

/**
 * `{x.icon}` as a bare JSX child: preceded by the closing `>` of a tag (same
 * line, optional whitespace) or alone at the start of a line. Group 1 keeps the
 * prefix so the replacement can re-emit it verbatim.
 */
const ICON_CHILD_RENDER_RE = /(>[ \t]*|^[ \t]*)\{([A-Za-z_$][\w$]*)\.icon\}/gm;

/**
 * Evidence that `icon` slots hold component references rather than string
 * names: `icon: SomeComponent` / `icon: Icons.foo`, or an explicit component
 * type annotation on an `icon` property.
 */
const COMPONENT_ICON_EVIDENCE_RE =
  /\bicon\??:\s*(?:[A-Z][\w.]*\s*[,;}\n)]|(?:LucideIcon|ComponentType|ElementType|FC|FunctionComponent)\b)/;

/** Evidence that `icon` slots hold string names: `icon: "anchor"` etc. */
const STRING_ICON_EVIDENCE_RE = /\bicon\??:\s*(?:["'`]|string\b)/;

export function fileSuggestsComponentIcons(code: string): boolean {
  return COMPONENT_ICON_EVIDENCE_RE.test(code);
}

export function fileSuggestsStringIcons(code: string): boolean {
  return STRING_ICON_EVIDENCE_RE.test(code);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract the array literal `const <name> = [ … ]` (optionally typed / `as
 * const`) from `code`. Bracket-balanced and string-aware enough for generated
 * data arrays. Returns null when `name` has no literal array initializer.
 */
function findArrayLiteral(code: string, name: string): string | null {
  const declRe = new RegExp(
    `\\b(?:const|let|var)\\s+${escapeRegExp(name)}\\b[^=;]*=\\s*\\[`,
    "g",
  );
  const match = declRe.exec(code);
  if (!match) return null;
  const start = match.index + match[0].length - 1;
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < code.length; i += 1) {
    const ch = code[i];
    if (quote) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Resolve which array the `itemName` at `position` iterates over: the CLOSEST
 * `arr.map((item) =>` / `arr.map(item =>` that opens before `position`. Two
 * lists that reuse the same callback name (`features.map((item) => …)` and
 * `products.map((item) => …)`) thus resolve to their own array instead of the
 * first match in the file (review #1329). Destructured params and
 * `for…of` are not resolved (→ file-level fallback).
 */
function findIteratedArrayName(
  code: string,
  itemName: string,
  position: number,
): string | null {
  const re = new RegExp(
    `\\b([A-Za-z_$][\\w$]*)\\.(?:map|forEach|flatMap)\\(\\s*\\(?\\s*${escapeRegExp(itemName)}\\b`,
    "g",
  );
  let closest: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    if (match.index >= position) break;
    closest = match[1];
  }
  return closest;
}

/**
 * Should `{itemName.icon}` at `position` be rewritten? Per-binding evidence
 * when the enclosing iteration's array literal is resolvable; conservative
 * file-level fallback otherwise. `position` defaults to end-of-file so callers
 * without a position still get the last (i.e. any) iteration in the file.
 */
export function bindingHoldsComponentIcons(
  code: string,
  itemName: string,
  position: number = code.length,
): boolean {
  const arrayName = findIteratedArrayName(code, itemName, position);
  const literal = arrayName ? findArrayLiteral(code, arrayName) : null;
  const scope = literal ?? code;
  return COMPONENT_ICON_EVIDENCE_RE.test(scope) && !STRING_ICON_EVIDENCE_RE.test(scope);
}

export function fixIconComponentValueMisuse(
  code: string,
  filePath: string,
): { code: string; fixed: boolean; fixes: FixEntry[] } {
  let nextCode = code;
  let fixed = false;

  nextCode = nextCode.replace(ICON_KEY_RE, (_full, itemName: string) => {
    fixed = true;
    return `key={typeof ${itemName}.icon === "string" ? ${itemName}.icon : (${itemName}.title ?? ${itemName}.label ?? ${itemName}.name ?? "icon-item")}`;
  });

  if (fileSuggestsComponentIcons(code)) {
    // Decide against the ORIGINAL code so offsets stay valid even though the
    // key rewrite above may already have shifted `nextCode`. The key rewrite
    // only touches `key={…}` attributes, never a bare child, so the set of
    // child matches (and their relative order) is identical in both strings;
    // resolve each match's offset back into `code` by locating the same
    // occurrence there.
    const childMatchesInOriginal = [...code.matchAll(ICON_CHILD_RENDER_RE)];
    let occurrence = 0;
    nextCode = nextCode.replace(
      ICON_CHILD_RENDER_RE,
      (full, prefix: string, itemName: string) => {
        const original = childMatchesInOriginal[occurrence];
        occurrence += 1;
        const position = original?.index ?? code.length;
        if (!bindingHoldsComponentIcons(code, itemName, position)) return full;
        fixed = true;
        return `${prefix}{typeof ${itemName}.icon === "string" ? ${itemName}.icon : <${itemName}.icon className="h-5 w-5" />}`;
      },
    );
  }

  return {
    code: nextCode,
    fixed,
    fixes: fixed
      ? [
          {
            fixer: "icon-component-value-fixer",
            category: "mechanical",
            description:
              "Replaced raw icon component values with stable key/render-safe JSX usage",
            file: filePath,
          },
        ]
      : [],
  };
}
