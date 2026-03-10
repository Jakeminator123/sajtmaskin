import type { SuspenseRule, StreamContext } from "../transform";

/**
 * Adds `export` to top-level React component declarations that lack it.
 *
 * Only matches lines at column 0 (no leading whitespace) with a
 * PascalCase identifier, which is a strong signal for a top-level
 * component definition.
 *
 *   `function Hero()` → `export default function Hero()`
 *   `const Hero =`     → `export const Hero =`
 *
 * `export default const` is invalid syntax, so const declarations
 * get a named export instead.
 */

const EXPORTED_RE = /^export\s/;
const FUNC_RE = /^function\s+[A-Z][a-zA-Z0-9]*\s*[(<]/;
const CONST_RE = /^const\s+[A-Z][a-zA-Z0-9]*\s*[=:]/;

export const missingExportFix: SuspenseRule = {
  name: "missing-export-fix",

  transform(line: string, _context: StreamContext): string {
    if (EXPORTED_RE.test(line)) return line;
    if (line.startsWith(" ") || line.startsWith("\t")) return line;

    if (FUNC_RE.test(line)) {
      return `export default ${line}`;
    }

    if (CONST_RE.test(line)) {
      return `export ${line}`;
    }

    return line;
  },
};
