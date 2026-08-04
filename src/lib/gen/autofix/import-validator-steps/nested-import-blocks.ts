import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import type { AutoFixEntry } from "../pipeline";
import { KNOWN_MODULE_SPECIFIERS } from "./known-imports";

function guessModuleForSpecifiers(specifiers: string[]): string | null {
  for (const [mod, known] of Object.entries(KNOWN_MODULE_SPECIFIERS)) {
    if (specifiers.every((s) => known.includes(s))) return mod;
    if (specifiers.some((s) => known.includes(s))) return mod;
  }
  if (specifiers.every((s) => LUCIDE_ICONS.has(s))) return "lucide-react";
  if (specifiers.every((s) => s in SHADCN_COMPONENTS)) return null;
  return null;
}

/**
 * Fix unclosed multi-line import blocks where a new `import` appears
 * before the `} from "..."` closer. GPT-5.x models sometimes generate:
 *
 *   import {
 *     useState,
 *     useEffect,
 *   import { Button } from "@/components/ui/button"
 *
 * This function detects the pattern and either closes the orphaned block
 * with a guessed module source, or removes the stale opener.
 */
export function fixNestedImportBlocks(code: string): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];
  const lines = code.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const isMultiLineOpener =
      /^\s*import\s*\{/.test(line) && !line.includes("} from") && !line.includes("from ");

    if (!isMultiLineOpener) {
      result.push(line);
      i++;
      continue;
    }

    const specifiers: string[] = [];
    const openerLine = i;
    let j = i;

    const openerMatch = /^\s*import\s*\{\s*(.*)$/.exec(line);
    if (openerMatch && openerMatch[1].trim()) {
      for (const s of openerMatch[1].split(",")) {
        const trimmed = s.trim().replace(/,+$/, "").trim();
        if (trimmed && !trimmed.startsWith("import ")) specifiers.push(trimmed);
      }
    }

    j++;
    let foundNested = false;
    let closerFound = false;

    while (j < lines.length && j < openerLine + 30) {
      const nextLine = lines[j];

      if (/^\s*\}\s*from\s+["']/.test(nextLine)) {
        closerFound = true;
        break;
      }

      if (/^\s*import\s+/.test(nextLine)) {
        foundNested = true;
        break;
      }

      const cleaned = nextLine.trim().replace(/,+$/, "").trim();
      if (cleaned && !cleaned.startsWith("//")) {
        for (const s of cleaned.split(",")) {
          const t = s.trim();
          if (t) specifiers.push(t);
        }
      }
      j++;
    }

    if (closerFound) {
      for (let k = i; k <= j; k++) result.push(lines[k]);
      i = j + 1;
      continue;
    }

    if (!foundNested) {
      result.push(line);
      i++;
      continue;
    }

    const validSpecifiers = specifiers
      .map((s) => s.split(/\s+as\s+/)[0].trim())
      .filter((s) => /^[A-Z_$a-z][\w$]*$/.test(s));

    if (validSpecifiers.length > 0) {
      const guessedModule = guessModuleForSpecifiers(validSpecifiers);
      if (guessedModule) {
        const importLine = `import { ${validSpecifiers.join(", ")} } from "${guessedModule}";`;
        result.push(importLine);
        fixes.push({
          fixer: "import-validator",
          description: `Closed orphaned import block with guessed source "${guessedModule}" for: ${validSpecifiers.join(", ")}`,
          line: openerLine + 1,
        });
      } else {
        fixes.push({
          fixer: "import-validator",
          description: `Removed orphaned import block with unresolvable specifiers: ${validSpecifiers.join(", ")}`,
          line: openerLine + 1,
        });
      }
    } else {
      fixes.push({
        fixer: "import-validator",
        description: "Removed empty orphaned import block opener",
        line: openerLine + 1,
      });
    }

    i = j;
  }

  return { code: result.join("\n"), fixes };
}
