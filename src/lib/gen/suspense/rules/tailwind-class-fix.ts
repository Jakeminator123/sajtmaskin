import type { SuspenseRule, StreamContext } from "../transform";

/**
 * Fixes common Tailwind CSS mistakes in shadcn/ui projects:
 *
 *  - Strips numeric suffixes from semantic tokens
 *    (`bg-primary-500` → `bg-primary`)
 *  - Replaces hardcoded dark-mode colors with semantic equivalents
 *    (`dark:bg-gray-900` → `dark:bg-background`)
 *  - Replaces `bg-white` / `text-black` with `bg-background` / `text-foreground`
 *    (only in className-like context)
 */

const SEMANTIC_SUFFIX_RE =
  /(bg|text|border|ring|outline)-(primary|secondary|accent|muted|destructive)-\d{2,3}/g;

const DARK_BG_RE = /dark:bg-(?:gray|slate|zinc|neutral)-\d{2,3}/g;
const DARK_TEXT_WHITE_RE = /dark:text-white/g;
const DARK_TEXT_GRAY_RE = /dark:text-(?:gray|slate|zinc|neutral)-\d{2,3}/g;

const CLASS_CONTEXT_RE = /className|class=|cn\(|clsx\(|twMerge\(/;
const BG_WHITE_RE = /\bbg-white\b/g;
const TEXT_BLACK_RE = /\btext-black\b/g;

export const tailwindClassFix: SuspenseRule = {
  name: "tailwind-class-fix",

  transform(line: string, _context: StreamContext): string {
    let result = line;

    result = result.replace(SEMANTIC_SUFFIX_RE, "$1-$2");

    result = result.replace(DARK_BG_RE, "dark:bg-background");
    result = result.replace(DARK_TEXT_WHITE_RE, "dark:text-foreground");
    result = result.replace(DARK_TEXT_GRAY_RE, "dark:text-foreground");

    if (CLASS_CONTEXT_RE.test(result)) {
      result = result.replace(BG_WHITE_RE, "bg-background");
      result = result.replace(TEXT_BLACK_RE, "text-foreground");
    }

    return result;
  },
};
