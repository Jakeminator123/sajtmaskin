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
 * Two guards now bound the rewrite:
 *  - Only a bare JSX CHILD is rewritten: `{x.icon}` directly after a `>` or
 *    alone at the start of a line. Attribute values (`prop={x.icon}`) and
 *    nested expressions are never touched.
 *  - The file must show evidence that `icon` holds a COMPONENT (an uppercase
 *    identifier or a component type in an `icon:` slot). A file whose icons are
 *    string names (`icon: "anchor"`) renders `{x.icon}` correctly as text, and
 *    the ternary would only add type errors there.
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
 * Evidence that `icon` slots in this file hold component references rather
 * than string names: `icon: SomeComponent` / `icon: Icons.foo`, or an explicit
 * component type annotation on an `icon` property.
 */
const COMPONENT_ICON_EVIDENCE_RE =
  /\bicon\??:\s*(?:[A-Z][\w.]*\s*[,;}\n)]|(?:LucideIcon|ComponentType|ElementType|FC|FunctionComponent)\b)/;

export function fileSuggestsComponentIcons(code: string): boolean {
  return COMPONENT_ICON_EVIDENCE_RE.test(code);
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
    nextCode = nextCode.replace(
      ICON_CHILD_RENDER_RE,
      (_full, prefix: string, itemName: string) => {
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
