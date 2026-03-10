import type { SuspenseRule, StreamContext } from "../transform";

/**
 * Fixes common TypeScript type annotation issues LLMs produce:
 *
 *  - `React.FC<Props>` → removed (prefer plain function signatures)
 *  - `): JSX.Element {` → `) {` (let TS infer the return type)
 *  - `(props: any)` → `(props: Record<string, unknown>)`
 */

const FC_RE = /:\s*React\.FC(<[^>]*>)?/;
const JSX_RETURN_RE = /\):\s*JSX\.Element\s*\{/;
const PROPS_ANY_RE = /\(props:\s*any\)/;

export const typeAnnotationFix: SuspenseRule = {
  name: "type-annotation-fix",

  transform(line: string, _context: StreamContext): string {
    let result = line;

    if (FC_RE.test(result)) {
      result = result.replace(FC_RE, "");
    }

    if (JSX_RETURN_RE.test(result)) {
      result = result.replace(/\):\s*JSX\.Element\s*\{/, ") {");
    }

    if (PROPS_ANY_RE.test(result)) {
      result = result.replace(
        PROPS_ANY_RE,
        "(props: Record<string, unknown>)",
      );
    }

    return result;
  },
};
