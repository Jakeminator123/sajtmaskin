import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import {
  findNearestIcon,
  isLucideTypeOnlyExport,
  parseSpecifier,
} from "@/lib/gen/suspense/rules/lucide-icon-fix";
import type { AutoFixEntry } from "../pipeline";

/**
 * Fix unknown lucide-react icon names in both single-line and multi-line imports.
 * Uses the same nearest-icon resolution as the streaming lucide-icon-fix rule,
 * but operates on the full file so it catches multi-line imports that the
 * per-line streaming rule cannot match.
 */
const LUCIDE_IMPORT_MULTILINE_RE =
  /(import\s*\{)([^}]*?)(\}\s*from\s*["']lucide-react["'])/g;

export function fixLucideImports(code: string): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];

  const fixed = code.replace(
    LUCIDE_IMPORT_MULTILINE_RE,
    (fullMatch, prefix: string, rawNames: string, suffix: string) => {
      const specifiers = rawNames
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (specifiers.length === 0) return fullMatch;

      let changed = false;
      const fixedSpecs = specifiers.flatMap((raw) => {
        // M#cr1 side-fix: inline type specifiers (`type PawPrint`) must be
        // left untouched. Running them through parseSpecifier/findNearestIcon
        // treated the whole string "type PawPrint" as an icon name and
        // fuzzy-corrupted the import into `Type as type PawPrint` (parse
        // error). Type-only bindings are erased at build — never fuzzy-match
        // or remove them here.
        if (/^type\s+/.test(raw)) return [raw];
        const { imported, local } = parseSpecifier(raw);

        if (isLucideTypeOnlyExport(imported) || isLucideTypeOnlyExport(local)) {
          changed = true;
          return [];
        }

        if (LUCIDE_ICONS.has(imported)) return [raw];

        const nearest = findNearestIcon(imported);
        if (!nearest) return [raw];
        changed = true;

        if (nearest === local) return [nearest];
        return [`${nearest} as ${local}`];
      });

      if (!changed) return fullMatch;
      if (fixedSpecs.length === 0) return "";

      const hasNewlines = rawNames.includes("\n");
      const joined = hasNewlines
        ? "\n  " + fixedSpecs.join(",\n  ") + ",\n"
        : " " + fixedSpecs.join(", ") + " ";

      const replacedNames = specifiers
        .filter((raw) => {
          if (/^type\s+/.test(raw)) return false;
          const { imported } = parseSpecifier(raw);
          return !LUCIDE_ICONS.has(imported) && findNearestIcon(imported) !== null;
        })
        .map((raw) => parseSpecifier(raw).imported);

      fixes.push({
        fixer: "import-validator",
        description: `Fixed unknown lucide icon(s): ${replacedNames.join(", ")}`,
        line: 0,
      });

      return `${prefix}${joined}${suffix}`;
    },
  );

  return { code: fixed, fixes };
}
