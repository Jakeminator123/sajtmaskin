import { LUCIDE_ICONS, LUCIDE_BRAND_ICON_REPLACEMENTS } from "@/lib/gen/data/lucide-icons";
import type { SuspenseRule, StreamContext } from "../transform";

export const FALLBACK_ICON = "Circle";

const LUCIDE_TYPE_ONLY_EXPORTS = new Set([
  "IconNode",
  "LucideIcon",
  "LucideProps",
  "SVGAttributes",
]);

export function isLucideTypeOnlyExport(name: string): boolean {
  return LUCIDE_TYPE_ONLY_EXPORTS.has(name);
}

/**
 * Matches `import { ... } from "lucide-react"` and validates each
 * imported name against the known icon set. Unknown icons get:
 *   1. A case-insensitive exact match  (e.g. "arrowRight" → ArrowRight)
 *   2. A substring/similarity match    (e.g. "MailIcon" → Mail)
 *   3. No rewrite if no real match exists. Hard fallback aliases like
 *      `Circle as Foo` hide upstream mistakes and can corrupt valid icons
 *      missing from our generated allow-list.
 */

const LUCIDE_IMPORT_RE =
  /^(\s*import\s*\{)([^}]+)(\}\s*from\s*)(["'])lucide-react\4\s*(;?)(\s*)$/;

const iconsLower = new Map<string, string>();
for (const icon of LUCIDE_ICONS) {
  iconsLower.set(icon.toLowerCase(), icon);
}

/**
 * Find the best matching known icon for an unknown name.
 *
 * Strategy (in priority order):
 *  1. Case-insensitive exact match
 *  2. Normalize alias affixes (leading `Lucide` prefix + trailing
 *     `Icon`/`Outlined`/`Filled`/`Sharp` suffix), then re-check exact
 *  3. Substring containment (icon name contained in query or vice versa)
 *  4. No match
 *
 * The `Lucide*` and `*Icon` alias forms are intentionally NOT in LUCIDE_ICONS
 * (it holds base names only — see src/lib/gen/data/lucide-icons.ts). They must
 * therefore be folded to the base name HERE, in step 2, BEFORE the loose
 * substring fallback — otherwise e.g. `LucideArrowDown` substring-matches the
 * much shorter `Ear` ("lucid**ear**rowdown") instead of `ArrowDown`.
 */
export function findNearestIcon(name: string): string | null {
  const brandReplacement = LUCIDE_BRAND_ICON_REPLACEMENTS[name];
  if (brandReplacement) return brandReplacement;

  const lower = name.toLowerCase();

  // 1. Case-insensitive exact
  const exact = iconsLower.get(lower);
  if (exact) return exact;

  // 2. Normalize alias affixes (leading `lucide`, trailing icon/style suffix)
  const stripped = lower
    .replace(/^lucide/, "")
    .replace(/icon$/i, "")
    .replace(/outlined$/i, "")
    .replace(/filled$/i, "")
    .replace(/sharp$/i, "");
  if (stripped && stripped !== lower) {
    const match = iconsLower.get(stripped);
    if (match) return match;
  }

  // 3. Substring containment — prefer shortest matching icon.
  // Guarded against degenerate short keys (a stray 1-2 char icon name would
  // otherwise match almost anything); require a stripped query of length >= 3.
  let best: string | null = null;
  if (stripped.length >= 3) {
    for (const [key, icon] of iconsLower) {
      if (key.includes(stripped) || stripped.includes(key)) {
        if (!best || icon.length < best.length) {
          best = icon;
        }
      }
    }
  }
  if (best) return best;

  return null;
}

/**
 * Parse a single import specifier which may be aliased:
 *   "Foo"        → { imported: "Foo", local: "Foo" }
 *   "Foo as Bar" → { imported: "Foo", local: "Bar" }
 */
export function parseSpecifier(raw: string): { imported: string; local: string } {
  const parts = raw.split(/\s+as\s+/);
  if (parts.length === 2) {
    return { imported: parts[0].trim(), local: parts[1].trim() };
  }
  const name = raw.trim();
  return { imported: name, local: name };
}

export const lucideIconFix: SuspenseRule = {
  name: "lucide-icon-fix",

  transform(line: string, _context: StreamContext): string {
    const match = line.match(LUCIDE_IMPORT_RE);
    if (!match) return line;

    const [, prefix, rawNames, middle, quote, semi, trailing] = match;
    const specifiers = rawNames
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (specifiers.length === 0) return line;

    let changed = false;
    const fixed = specifiers.flatMap((raw) => {
      const { imported, local } = parseSpecifier(raw);

      if (isLucideTypeOnlyExport(imported) || isLucideTypeOnlyExport(local)) {
        changed = true;
        return [];
      }

      if (LUCIDE_ICONS.has(imported)) {
        // Already valid — preserve original text (including alias).
        return [raw];
      }

      const nearest = findNearestIcon(imported);
      if (!nearest) return [raw];
      changed = true;

      if (nearest === local) {
        // Nearest match IS the desired local name — no alias needed.
        return [nearest];
      }

      return [`${nearest} as ${local}`];
    });

    if (!changed) return line;
    if (fixed.length === 0) return "";

    return `${prefix} ${fixed.join(", ")} ${middle}${quote}lucide-react${quote}${semi}${trailing}`;
  },
};
