import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import type { SuspenseRule, StreamContext } from "../transform";

const FALLBACK_ICON = "Circle";

/**
 * Matches `import { ... } from "lucide-react"` and validates each
 * imported name against the known icon set. Unknown icons get:
 *   1. A case-insensitive exact match  (e.g. "arrowRight" → ArrowRight)
 *   2. A substring/similarity match    (e.g. "MailIcon" → Mail)
 *   3. Fallback to Circle              (e.g. "VercelLogo" → Circle as VercelLogo)
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
 *  2. Strip common suffixes ("Icon", "Outlined", "Filled") then re-check
 *  3. Substring containment (icon name contained in query or vice versa)
 *  4. Fallback to Circle
 */
function findNearestIcon(name: string): string {
  const lower = name.toLowerCase();

  // 1. Case-insensitive exact
  const exact = iconsLower.get(lower);
  if (exact) return exact;

  // 2. Strip common suffixes
  const stripped = lower
    .replace(/icon$/i, "")
    .replace(/outlined$/i, "")
    .replace(/filled$/i, "")
    .replace(/sharp$/i, "");
  if (stripped && stripped !== lower) {
    const match = iconsLower.get(stripped);
    if (match) return match;
  }

  // 3. Substring containment — prefer shortest matching icon
  let best: string | null = null;
  for (const [key, icon] of iconsLower) {
    if (key.includes(stripped) || stripped.includes(key)) {
      if (!best || icon.length < best.length) {
        best = icon;
      }
    }
  }
  if (best) return best;

  return FALLBACK_ICON;
}

/**
 * Parse a single import specifier which may be aliased:
 *   "Foo"        → { imported: "Foo", local: "Foo" }
 *   "Foo as Bar" → { imported: "Foo", local: "Bar" }
 */
function parseSpecifier(raw: string): { imported: string; local: string } {
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
    const fixed = specifiers.map((raw) => {
      const { imported, local } = parseSpecifier(raw);

      if (LUCIDE_ICONS.has(imported)) {
        // Already valid — preserve original text (including alias).
        return raw;
      }

      changed = true;
      const nearest = findNearestIcon(imported);

      if (nearest === local) {
        // Nearest match IS the desired local name — no alias needed.
        return nearest;
      }

      return `${nearest} as ${local}`;
    });

    if (!changed) return line;

    return `${prefix} ${fixed.join(", ")} ${middle}${quote}lucide-react${quote}${semi}${trailing}`;
  },
};
