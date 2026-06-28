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
 * Detection is intentionally NARROW to avoid false positives on type positions
 * (a broad `key: X` scan matches `user: User` / `x: Home` where the capitalized
 * name is a TYPE, not a runtime icon). We only treat as a value reference:
 *   - icon-ish object property values: `icon: X`, `leadingIcon: X`, `glyph: X`
 *   - assignment RHS: `const Icon = X` (excluding type aliases / member access)
 * and only when `X` is a real `LUCIDE_ICONS` entry that is not already imported
 * (single- OR multi-line import) and not declared locally (incl. interface/type).
 * `Image` / `Link` are left to the `next/*`-aware fixers.
 */

const AMBIGUOUS_WITH_NEXT = new Set(["Image", "Link"]);

// Icon-ish property whose value is a lucide component. The trailing lookahead
// skips type-position values (`icon: Home[]`, `icon: Home | Menu`, `icon: T<...>`).
const ICON_PROP_RE =
  /\b(?:[A-Za-z]*[Ii]con|glyph)\s*:\s*([A-Z][A-Za-z0-9]+)\b(?!\s*[<|&\[])/g;

// Assignment RHS (`= Icon`): lookbehind excludes ==, ===, =>, !=, <=, >=;
// lookahead excludes member/call/index usages (`= Foo.bar`, `= Foo(`, `= Foo[`).
const ASSIGN_RE = /(?<![=!<>])=\s*([A-Z][A-Za-z0-9]+)\b(?![.([])/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Names already bound by an import statement (default, named, namespace).
 * Handles BOTH single-line and multi-line `import { ... }` blocks — `[^}]*`
 * spans newlines but never crosses another import's closing brace.
 */
function collectImportedNames(code: string): Set<string> {
  const names = new Set<string>();
  for (const m of code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const spec of m[1].split(",")) {
      const trimmed = spec.trim();
      if (!trimmed) continue;
      const aliased = trimmed.match(/(\w+)\s+as\s+(\w+)/);
      names.add(aliased ? aliased[2] : trimmed.replace(/^type\s+/, ""));
    }
  }
  for (const m of code.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)\s/g)) {
    names.add(m[1]);
  }
  for (const m of code.matchAll(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  return names;
}

/**
 * True when the file declares `name` locally (function/const/let/var/class/
 * interface/type/enum), so it must not be imported from lucide-react and shadow
 * the local declaration (e.g. a local `User` interface or `Calendar` component).
 */
function fileDeclaresSymbol(code: string, name: string): boolean {
  const n = escapeRegExp(name);
  return new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?` +
      `(?:function|const|let|var|class|interface|type|enum)\\s+${n}\\b`,
  ).test(code);
}

function lineAt(code: string, index: number): string {
  const start = code.lastIndexOf("\n", index) + 1;
  const end = code.indexOf("\n", index);
  return code.slice(start, end === -1 ? undefined : end);
}

export function fixLucideValueImports(
  code: string,
  filePath: string,
): { code: string; fixed: boolean; fixes: FixEntry[] } {
  const imported = collectImportedNames(code);
  const needed: string[] = [];
  const seen = new Set<string>();

  const consider = (name: string) => {
    if (seen.has(name)) return;
    if (!LUCIDE_ICONS.has(name)) return;
    if (AMBIGUOUS_WITH_NEXT.has(name)) return;
    if (imported.has(name)) return;
    if (fileDeclaresSymbol(code, name)) return;
    seen.add(name);
    needed.push(name);
  };

  for (const m of code.matchAll(ICON_PROP_RE)) consider(m[1]);
  for (const m of code.matchAll(ASSIGN_RE)) {
    // Skip `type Alias = X` — the RHS of a type alias is a type, not a value.
    if (/^\s*(?:export\s+)?type\s/.test(lineAt(code, m.index ?? 0))) continue;
    consider(m[1]);
  }

  if (needed.length === 0) return { code, fixed: false, fixes: [] };

  const fix = (description: string): FixEntry[] => [
    {
      fixer: "lucide-value-import-fixer",
      category: "mechanical",
      description,
      file: filePath,
    },
  ];

  // Merge into an existing VALUE lucide-react import (single- or multi-line);
  // `import\s+\{` (no `type`) excludes `import type { ... } from "lucide-react"`,
  // and `[^}]*` never crosses another import's brace.
  const importMatch = code.match(
    /import\s+\{([^}]*)\}\s*from\s*["']lucide-react["']/,
  );
  if (importMatch) {
    const existingSpecs = importMatch[1]
      .split(",")
      .map((spec) => spec.trim())
      .filter(Boolean);
    const existingNames = new Set(
      existingSpecs.map((spec) => {
        const aliased = spec.match(/(\w+)\s+as\s+(\w+)/);
        return aliased ? aliased[2] : spec.replace(/^type\s+/, "");
      }),
    );
    const toAdd = needed.filter((name) => !existingNames.has(name));
    if (toAdd.length === 0) return { code, fixed: false, fixes: [] };
    const replacement = `import { ${[...existingSpecs, ...toAdd].join(", ")} } from "lucide-react"`;
    return {
      code: code.replace(importMatch[0], replacement),
      fixed: true,
      fixes: fix(`Added lucide value import(s): ${toAdd.join(", ")}`),
    };
  }

  // Otherwise insert a fresh import after the existing import block / directive.
  const lines = code.split("\n");
  const newImport = `import { ${needed.join(", ")} } from "lucide-react"`;
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
    fixes: fix(`Added lucide value import(s): ${needed.join(", ")}`),
  };
}
