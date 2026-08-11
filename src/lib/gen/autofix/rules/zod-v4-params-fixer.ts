/**
 * Zod 4 params fixer.
 *
 * Background: the user-site baseline pins `zod` v4 (`project-scaffold.ts`
 * PACKAGE_JSON, dep-completer `KNOWN_PACKAGES`), but models still know the
 * Zod 3 params API by heart. Zod 4 params accept `{ message }` / `{ error }`
 * — `errorMap` no longer exists, so one habitual
 *
 *   consent: z.literal(true, { errorMap: () => ({ message: "..." }) })
 *
 * fails the params overload, which changes the schema's inferred type, which
 * breaks the `zodResolver` type, which cascades TS2322 into every
 * `<FormField control={form.control}>` in the file.
 *
 * Empirical hit: prod chat `fc0f053b` (2026-08-11), version `98351a78`,
 * `components/contact-form.tsx` line 76 — 1 root cause produced 12 typecheck
 * errors, both quality-gate attempts failed, and server repair gave up after
 * 2 passes.
 *
 * Fix: rewrite `errorMap: () => ({ message: <string literal> })` to
 * `message: <string literal>` — semantically what the model meant, and the
 * exact Zod 4 spelling.
 *
 * Conservative scope (mirrors `r3f-vector-tuple-fixer`):
 *   - Only triggered when the file imports from `zod`.
 *   - Only the arrow-returning-`{ message }` form, and only when the message
 *     is a plain string/template literal (an errorMap that actually inspects
 *     its `issue` argument is left for the LLM fixer).
 *   - The prompt core (`04-coding-direction.md` → Recurring Pitfalls) tells
 *     the model not to write Zod 3 params in the first place; this rule is
 *     the cheap deterministic backstop.
 */

import type { FixEntry } from "../types";

type ZodFixResult = {
  code: string;
  fixed: boolean;
  fixes: FixEntry[];
};

const ZOD_IMPORT_RE = /from\s+["']zod["']/;

/**
 * `errorMap: (issue?) => ({ message: "..." })` with an optional trailing comma
 * inside the returned object. The message value must be a complete
 * string/template literal so we never truncate an expression.
 *
 * Capture group 1: the message literal (quotes included).
 */
const ERROR_MAP_MESSAGE_RE =
  /\berrorMap\s*:\s*\(\s*[\w$]*\s*\)\s*=>\s*\(\s*\{\s*message\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*,?\s*\}\s*\)/g;

export function fixZodV4Params(code: string, filePath: string): ZodFixResult {
  if (!ZOD_IMPORT_RE.test(code)) {
    return { code, fixed: false, fixes: [] };
  }

  let count = 0;
  const next = code.replace(ERROR_MAP_MESSAGE_RE, (_match, literal: string) => {
    count += 1;
    return `message: ${literal}`;
  });

  if (count === 0) {
    return { code, fixed: false, fixes: [] };
  }

  return {
    code: next,
    fixed: true,
    fixes: [
      {
        fixer: "zod-v4-params-fixer",
        category: "mechanical",
        description:
          count === 1
            ? "Rewrote 1 Zod 3 `errorMap: () => ({ message })` param to Zod 4 `message` (zod v4 baseline)"
            : `Rewrote ${count} Zod 3 \`errorMap: () => ({ message })\` params to Zod 4 \`message\` (zod v4 baseline)`,
        file: filePath,
      },
    ],
  };
}
