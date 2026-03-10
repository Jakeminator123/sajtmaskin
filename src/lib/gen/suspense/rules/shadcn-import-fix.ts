import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import type { SuspenseRule, StreamContext } from "../transform";

/**
 * Matches an import from `@/components/ui` WITHOUT a subpath and fixes
 * it to the correct subpath based on the imported component names.
 *
 * Handles both single and multi-import cases:
 *   `import { Button } from "@/components/ui"`
 *     → `import { Button } from "@/components/ui/button"`
 *
 *   `import { Card, CardHeader } from "@/components/ui"`
 *     → `import { Card, CardHeader } from "@/components/ui/card"`
 *
 *   `import { Button, Card } from "@/components/ui"` (different subpaths)
 *     → `import { Button } from "@/components/ui/button"\nimport { Card } from "@/components/ui/card"`
 */

const IMPORT_RE =
  /^(\s*import\s*\{)([^}]+)(\}\s*from\s*)(["'])@\/components\/ui\4\s*(;?)(\s*)$/;

function resolveSubpath(names: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const name of names) {
    const subpath = SHADCN_COMPONENTS[name];
    if (subpath) {
      const existing = grouped.get(subpath) ?? [];
      existing.push(name);
      grouped.set(subpath, existing);
    }
  }
  return grouped;
}

export const shadcnImportFix: SuspenseRule = {
  name: "shadcn-import-fix",

  transform(line: string, _context: StreamContext): string {
    const match = line.match(IMPORT_RE);
    if (!match) return line;

    const [, prefix, rawNames, middle, quote, semi, trailing] = match;
    const names = rawNames
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    if (names.length === 0) return line;

    const grouped = resolveSubpath(names);

    if (grouped.size === 0) {
      // None of the names are known — leave unchanged to avoid damage.
      return line;
    }

    if (grouped.size === 1) {
      const [subpath, groupedNames] = [...grouped.entries()][0];
      return `${prefix} ${groupedNames.join(", ")} ${middle}${quote}@/components/ui/${subpath}${quote}${semi}${trailing}`;
    }

    // Multiple subpaths — split into separate import statements.
    const lines: string[] = [];
    // Preserve any names NOT found in the map (pass through in first line).
    const unknowns = names.filter((n) => !SHADCN_COMPONENTS[n]);

    for (const [subpath, groupedNames] of grouped) {
      lines.push(
        `${prefix} ${groupedNames.join(", ")} ${middle}${quote}@/components/ui/${subpath}${quote}${semi}`,
      );
    }

    if (unknowns.length > 0) {
      lines.push(
        `${prefix} ${unknowns.join(", ")} ${middle}${quote}@/components/ui${quote}${semi}`,
      );
    }

    return lines.join("\n");
  },
};
