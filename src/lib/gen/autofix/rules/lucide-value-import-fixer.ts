import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import type { FixEntry } from "../types";

/**
 * Deterministic lucide *value* import fixer.
 *
 * The JSX scan in `import-validator` only adds a lucide import when an icon is
 * used as a JSX tag (`<PawPrint />`). Generated sites frequently store a lucide
 * icon as a VALUE in a data structure and render it dynamically:
 *
 *   const MOTIFS = [{ icon: PawPrint }, { icon: MoonStar }];
 *   const Icon = MOTIFS[0].icon;
 *   return <Icon />;            // dynamic — `<PawPrint />` never appears
 *
 * With no `<PawPrint />` tag and no tsc diagnostic on the export/preview path,
 * neither the JSX scan nor the diagnostic-driven `ts2304-known-import-fixer`
 * adds the import, so the bundle ships `icon: PawPrint` with `PawPrint`
 * undefined → `ReferenceError: PawPrint is not defined` → white screen (the
 * recurring incident class of #200/#201, latest: `motif-selector.tsx`).
 *
 * This rule closes the gap deterministically: it scans for lucide icon names in
 * value position (`: X`, `= X`) and adds a VALUE import for any real
 * `LUCIDE_ICONS` entry that is not already imported or locally declared. Bare
 * identifier matching after `:` / `=` naturally skips string icon names
 * (`icon: "PawPrint"`).
 *
 * `Image` / `Link` are intentionally skipped — they collide with `next/*` and
 * are resolved by the `ts2304` / `lucide-misuse` fixers instead.
 */

const AMBIGUOUS_WITH_NEXT = new Set(["Image", "Link"]);

// Value position: an icon used as a property value (`icon: X`) or an
// assignment / default (`= X`). Requiring a bare identifier after `:` / `=`
// means a string icon name (`icon: "PawPrint"`) is correctly ignored, and the
// name before a `:` (an object key) is never captured as a value.
const VALUE_REF_RE = /[:=]\s*([A-Z][A-Za-z0-9]+)\b/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Names already bound by an import statement (default, named, namespace). */
function collectImportedNames(code: string): Set<string> {
  const names = new Set<string>();
  for (const line of code.split("\n")) {
    const named = line.match(/^\s*import\s+(?:type\s+)?\{([^}]+)\}/);
    if (named) {
      for (const spec of named[1].split(",")) {
        const aliased = spec.trim().match(/(\w+)\s+as\s+(\w+)/);
        const bound = aliased ? aliased[2] : spec.trim();
        if (bound) names.add(bound);
      }
    }
    const def = line.match(/^\s*import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)\s/);
    if (def) names.add(def[1]);
    const ns = line.match(/^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) names.add(ns[1]);
  }
  return names;
}

/**
 * True when the file already declares `name` locally (function/const/let/var/
 * class), so it must not be imported from lucide-react and shadow the local
 * declaration (e.g. a local `Calendar` component that shares an icon name).
 */
function fileDeclaresSymbol(code: string, name: string): boolean {
  const n = escapeRegExp(name);
  return new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function|const|let|var|class)\\s+${n}\\b`,
  ).test(code);
}

export function fixLucideValueImports(
  code: string,
  filePath: string,
): { code: string; fixed: boolean; fixes: FixEntry[] } {
  const imported = collectImportedNames(code);

  const needed: string[] = [];
  const seen = new Set<string>();
  for (const match of code.matchAll(VALUE_REF_RE)) {
    const name = match[1];
    if (seen.has(name)) continue;
    if (!LUCIDE_ICONS.has(name)) continue;
    if (AMBIGUOUS_WITH_NEXT.has(name)) continue;
    if (imported.has(name)) continue;
    if (fileDeclaresSymbol(code, name)) continue;
    seen.add(name);
    needed.push(name);
  }

  if (needed.length === 0) return { code, fixed: false, fixes: [] };

  const lines = code.split("\n");

  // Merge into an existing VALUE lucide import (never a `import type` line —
  // that would make the icon type-only and trip TS1361 at the value usage).
  const existingIdx = lines.findIndex(
    (line) =>
      (line.includes('from "lucide-react"') || line.includes("from 'lucide-react'")) &&
      /^\s*import\s+\{/.test(line) &&
      !/^\s*import\s+type\s/.test(line),
  );

  let added: string[] = [];

  if (existingIdx >= 0) {
    const braceMatch = lines[existingIdx].match(/^(\s*import\s+\{)([^}]*)(\}\s*from\s+.+)$/);
    if (braceMatch) {
      const existingSpecs = braceMatch[2]
        .split(",")
        .map((spec) => spec.trim())
        .filter(Boolean);
      added = needed.filter((name) => !existingSpecs.includes(name));
      if (added.length === 0) return { code, fixed: false, fixes: [] };
      lines[existingIdx] =
        `${braceMatch[1]}${braceMatch[2].trimEnd()}, ${added.join(", ")} ${braceMatch[3]}`;
      return {
        code: lines.join("\n"),
        fixed: true,
        fixes: [
          {
            fixer: "lucide-value-import-fixer",
            category: "mechanical",
            description: `Added lucide value import(s): ${added.join(", ")}`,
            file: filePath,
          },
        ],
      };
    }
  }

  // Otherwise insert a fresh import after the existing import block / directive.
  added = needed;
  const newImport = `import { ${added.join(", ")} } from "lucide-react"`;
  let insertIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s/.test(lines[i]) || /^\s*["']use /.test(lines[i])) {
      insertIdx = i + 1;
    } else if (insertIdx > 0) {
      break;
    }
  }
  lines.splice(insertIdx, 0, newImport);

  return {
    code: lines.join("\n"),
    fixed: true,
    fixes: [
      {
        fixer: "lucide-value-import-fixer",
        category: "mechanical",
        description: `Added lucide value import(s): ${added.join(", ")}`,
        file: filePath,
      },
    ],
  };
}
