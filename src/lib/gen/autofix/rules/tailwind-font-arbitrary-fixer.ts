/**
 * Replaces Tailwind arbitrary font-family classes like
 * `font-[family-name:var(--font-serif)]` with inline style equivalents.
 *
 * These classes cause Turbopack/PostCSS to emit corrupt CSS with control
 * characters (\u0018, \u0002) in Next.js 16+.
 */

const FONT_FAMILY_ARBITRARY_RE =
  /className="([^"]*)font-\[family-name:var\(--([a-zA-Z0-9-]+)\)\]([^"]*)"/g;

export function fixTailwindFontArbitrary(
  code: string,
): { code: string; fixed: boolean; count: number } {
  let count = 0;

  const result = code.replace(
    FONT_FAMILY_ARBITRARY_RE,
    (_match, before: string, varName: string, after: string) => {
      count++;
      const cleanBefore = before.trim();
      const cleanAfter = after.trim();
      const remainingClasses = [cleanBefore, cleanAfter]
        .filter(Boolean)
        .join(" ");

      const classAttr = remainingClasses
        ? `className="${remainingClasses}"`
        : "";
      const styleAttr = `style={{ fontFamily: "var(--${varName})" }}`;

      return [classAttr, styleAttr].filter(Boolean).join(" ");
    },
  );

  return { code: result, fixed: count > 0, count };
}
