/**
 * R3F vector-tuple fixer.
 *
 * Background: React Three Fiber elements like `<mesh position={...}>`,
 * `<group rotation={...}>`, `<sphereGeometry args={...}>` accept tuples
 * (`[x, y, z]`) declared via the `Vector3Like` type. When the LLM puts a
 * 3-number array in an OBJECT field (e.g. `{ position: [-0.28, 0.52, 0.57] }`)
 * TypeScript widens the inferred type to `number[]` because object literals
 * lose contextual typing. Passing that array later to `<mesh position={drop.position}>`
 * then fails with TS2322:
 *
 *   Type 'number[]' is not assignable to type 'Vector3 | [x:number,y:number,z:number]'
 *
 * Empirical hit: chat `cdc23879...`, version `e6590fc4...`, file
 * `components/flying-meatball-canvas.tsx` line 215 — `condensationDrops` had
 * `scale: [...] as const` but `position: [...]` without `as const`, so quality
 * gate blocked promotion.
 *
 * Fix: when a property literal named `position`, `scale`, `rotation`, or `args`
 * is followed by a bracketed list of exactly 3 numeric literals AND not already
 * suffixed by `as const`, append ` as const`.
 *
 * Conservative scope:
 *   - Only triggered when the file imports from `@react-three/fiber` or
 *     `three` (otherwise the prop names are too generic to touch safely).
 *   - JSX prop literals (`position={[1,2,3]}`) are never matched because the
 *     pattern requires a colon, which JSX uses `=` for.
 *   - Only 3-element tuples — the canonical Vector3 shape. Variable-length
 *     `args` (e.g. `cylinderGeometry args={[1.16, 1.2, 0.34, 48]}`) sit in
 *     JSX and so already infer correctly via contextual typing.
 *
 * NOTE: The LLM-fixer prompt mentions this same pitfall (see
 * `fixer-prompt.ts`). This deterministic rule is the cheap first line of
 * defense; the LLM-fixer is the fallback if a more complex case appears.
 */

import type { FixEntry } from "../types";

type R3FFixResult = {
  code: string;
  fixed: boolean;
  fixes: FixEntry[];
};

const R3F_IMPORT_RE = /from\s+["'](?:@react-three\/fiber|@react-three\/drei|three)["']/;

/**
 * Match a property field with name `position` / `scale` / `rotation` / `args`,
 * value being an inline 3-number array, NOT followed by `as const`.
 *
 * Capture groups:
 *   1: prop name
 *   2: full bracketed literal (incl. brackets) — used for replacement insertion point
 */
const TUPLE_FIELD_RE =
  /\b(position|scale|rotation|args)\s*:\s*(\[\s*-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\s*,\s*-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\s*,\s*-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\s*\])(?!\s*as\s+const)/g;

/**
 * Append ` as const` to qualifying inline 3-number tuple property values.
 *
 * Returns the number of replacements made via `fixes`. The caller decides how
 * to surface them (one entry per file is what `pipeline.ts` does for similar
 * rules). We emit a single `FixEntry` summarizing the count to keep
 * `autofix_heavy_load` thresholds meaningful.
 */
export function fixR3FVectorTuples(code: string, filePath: string): R3FFixResult {
  if (!R3F_IMPORT_RE.test(code)) {
    return { code, fixed: false, fixes: [] };
  }

  let count = 0;
  const next = code.replace(TUPLE_FIELD_RE, (_match, name: string, literal: string) => {
    count += 1;
    return `${name}: ${literal} as const`;
  });

  if (count === 0) {
    return { code, fixed: false, fixes: [] };
  }

  return {
    code: next,
    fixed: true,
    fixes: [
      {
        fixer: "r3f-vector-tuple-fixer",
        category: "mechanical",
        description:
          count === 1
            ? "Added `as const` to 1 React Three Fiber 3-number tuple field (Vector3-like position/scale/rotation/args)"
            : `Added \`as const\` to ${count} React Three Fiber 3-number tuple fields (Vector3-like position/scale/rotation/args)`,
        file: filePath,
      },
    ],
  };
}
