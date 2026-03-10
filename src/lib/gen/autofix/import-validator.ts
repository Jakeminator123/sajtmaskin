import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import type { AutoFixEntry } from "./pipeline";

const IMPORT_RE = /^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/gm;

interface ImportStatement {
  names: string[];
  source: string;
  line: string;
  lineNumber: number;
}

function extractImports(code: string): ImportStatement[] {
  const results: ImportStatement[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    IMPORT_RE.lastIndex = 0;
    const match = IMPORT_RE.exec(line);
    if (!match) continue;

    const names = match[1]
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    results.push({ names, source: match[2], line, lineNumber: i });
  }

  return results;
}

/**
 * Fix incorrect shadcn/ui import paths.
 * LLMs often import from wrong subpaths (e.g. `@/components/ui/card` for `CardHeader`
 * when it should come from the same file, or using `@/components/ui/badge` for `BadgeCheck`
 * which is a lucide icon).
 */
function fixShadcnImports(code: string): { code: string; fixes: AutoFixEntry[] } {
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

/**
 * Validate all imports and return warnings for unknown components/icons.
 * Does not block — only flags for logging.
 */
function validateImports(code: string): string[] {
  const warnings: string[] = [];
  const imports = extractImports(code);

  for (const imp of imports) {
    if (imp.source.startsWith("@/components/ui/")) {
      for (const name of imp.names) {
        if (!SHADCN_COMPONENTS[name]) {
          warnings.push(
            `Unknown shadcn component "${name}" imported from "${imp.source}" (line ${imp.lineNumber + 1})`,
          );
        }
      }
    }

    if (imp.source === "lucide-react") {
      for (const name of imp.names) {
        if (!LUCIDE_ICONS.has(name)) {
          warnings.push(
            `Unknown lucide icon "${name}" (line ${imp.lineNumber + 1})`,
          );
        }
      }
    }
  }

  return warnings;
}

export function runImportValidator(code: string): {
  code: string;
  fixes: AutoFixEntry[];
  warnings: string[];
} {
  const { code: fixedCode, fixes } = fixShadcnImports(code);
  const warnings = validateImports(fixedCode);
  return { code: fixedCode, fixes, warnings };
}
