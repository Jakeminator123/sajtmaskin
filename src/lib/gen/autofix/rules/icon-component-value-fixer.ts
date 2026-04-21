/**
 * Mechanical fixer: replace raw `item.icon` JSX usage (which uses a
 * Lucide component as a React key or plain JSX child) with a stable,
 * render-safe form that handles both string icon names and component
 * references.
 *
 * Extracted from `src/lib/gen/autofix/pipeline.ts` 2026-04-21.
 */

import type { FixEntry } from "../types";

const ICON_KEY_RE = /key=\{([A-Za-z_$][\w$]*)\.icon\}/g;
const ICON_VALUE_RENDER_RE = /(\s*)\{([A-Za-z_$][\w$]*)\.icon\}(\s*)/g;

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

  nextCode = nextCode.replace(
    ICON_VALUE_RENDER_RE,
    (full, prefix: string, itemName: string, suffix: string) => {
      if (full.includes("<")) return full;
      fixed = true;
      return `${prefix}{typeof ${itemName}.icon === "string" ? ${itemName}.icon : <${itemName}.icon className="h-5 w-5" />}${suffix}`;
    },
  );

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
