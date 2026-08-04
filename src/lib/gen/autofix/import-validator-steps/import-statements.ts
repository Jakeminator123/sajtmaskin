import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";

export const IMPORT_RE = /^import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/gm;

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
      .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    results.push({ names, source: match[2], line, lineNumber: i });
  }

  return results;
}

/**
 * Validate all imports and return warnings for unknown components/icons.
 * Does not block — only flags for logging.
 */
export function validateImports(code: string): string[] {
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
