import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import type { AutoFixEntry } from "../pipeline";
import { IMPORT_RE } from "./import-statements";

/**
 * Fix incorrect shadcn/ui import paths.
 * LLMs often import from wrong subpaths (e.g. `@/components/ui/card` for `CardHeader`
 * when it should come from the same file, or using `@/components/ui/badge` for `BadgeCheck`
 * which is a lucide icon).
 */
export function fixShadcnImports(code: string): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    IMPORT_RE.lastIndex = 0;
    const match = IMPORT_RE.exec(line);
    if (!match) continue;

    const source = match[2];
    if (!source.startsWith("@/components/ui/")) continue;

    const names = match[1]
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    const correctedBySubpath = new Map<string, string[]>();
    const unknownNames: string[] = [];

    for (const name of names) {
      const correctSubpath = SHADCN_COMPONENTS[name];
      if (correctSubpath) {
        const fullPath = `@/components/ui/${correctSubpath}`;
        const existing = correctedBySubpath.get(fullPath) ?? [];
        existing.push(name);
        correctedBySubpath.set(fullPath, existing);
      } else {
        unknownNames.push(name);
      }
    }

    if (correctedBySubpath.size <= 1 && unknownNames.length === 0) continue;

    const newLines: string[] = [];
    for (const [path, pathNames] of correctedBySubpath) {
      newLines.push(`import { ${pathNames.join(", ")} } from "${path}"`);
    }
    if (unknownNames.length > 0) {
      newLines.push(`import { ${unknownNames.join(", ")} } from "${source}"`);
    }

    if (newLines.length === 1 && newLines[0] === line) continue;

    lines.splice(i, 1, ...newLines);
    fixes.push({
      fixer: "import-validator",
      description: `Corrected shadcn import grouping for: ${names.join(", ")}`,
      line: i + 1,
    });
    i += newLines.length - 1;
  }

  return { code: lines.join("\n"), fixes };
}
