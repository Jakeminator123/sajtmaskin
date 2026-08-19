/**
 * Footer copyright-year fixer.
 *
 * Generated `site-footer.tsx` often renders `new Date().getFullYear()` on the
 * copyright line. That call is non-deterministic across server and client
 * (and across New Year), so React hydration can mismatch. Hydration
 * preflight flags `new Date()` as advisory only, so the version is still
 * promoted. `global-shadow-import-fixer` keeps `Date` unshadowed — it does
 * not remove the call.
 *
 * This rule bakes the year at fix time into a numeric (or string) literal.
 * A site generated in December keeps that year in January: a snapshot, not
 * a live clock. `suppressHydrationWarning` is intentionally not used — it
 * would hide the mismatch instead of fixing it.
 *
 * Scope is deliberately narrow:
 *   - only `site-footer.(tsx|jsx)`
 *   - only the no-arg `new Date().getFullYear()` chain (optional `.toString()`)
 *   - other `new Date()` calls, even in the same file, are left alone
 */

import type { FixEntry } from "../types";

export type FooterCopyrightYearResult = {
  code: string;
  fixed: boolean;
  fixes: FixEntry[];
};

const SITE_FOOTER_PATH_RE = /(?:^|\/)site-footer\.(tsx|jsx)$/i;

/**
 * `new Date().getFullYear()` plus an optional trailing `.toString()`.
 * `new Date(arg).getFullYear()` is deterministic and must not match.
 */
const COPYRIGHT_YEAR_RE =
  /\bnew\s+Date\s*\(\s*\)\s*\.\s*getFullYear\s*\(\s*\)(\s*\.\s*toString\s*\(\s*\))?/g;

export function isSiteFooterPath(filePath: string): boolean {
  return SITE_FOOTER_PATH_RE.test(filePath.replace(/\\/g, "/"));
}

export function fixFooterCopyrightYear(
  code: string,
  filePath: string,
  year: number = new Date().getFullYear(),
): FooterCopyrightYearResult {
  const noop: FooterCopyrightYearResult = { code, fixed: false, fixes: [] };
  if (!isSiteFooterPath(filePath)) return noop;
  if (!/\bnew\s+Date\s*\(/.test(code) || !code.includes("getFullYear")) return noop;

  let count = 0;
  const yearText = String(year);
  const next = code.replace(
    COPYRIGHT_YEAR_RE,
    (_match, toStringCall: string | undefined) => {
      count += 1;
      return toStringCall ? JSON.stringify(yearText) : yearText;
    },
  );

  if (count === 0) return noop;

  return {
    code: next,
    fixed: true,
    fixes: [
      {
        fixer: "footer-copyright-year-fixer",
        category: "mechanical",
        description:
          count === 1
            ? `Replaced footer copyright new Date().getFullYear() with ${yearText}`
            : `Replaced ${count} footer copyright new Date().getFullYear() calls with ${yearText}`,
        file: filePath,
      },
    ],
  };
}
