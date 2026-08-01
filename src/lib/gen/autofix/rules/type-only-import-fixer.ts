/**
 * Type-only import fixer (TS2749).
 *
 * Background: when the LLM imports a value-binding for something it only
 * uses in a type position, TypeScript emits TS2749:
 *
 *   'PointerPosition' refers to a value, but is being used as a type here.
 *
 * Empirical hit (chat `cdc23879...`, version `9534dd5c...`): two generated
 * R3F components imported `PointerPosition` with `import { PointerPosition }`
 * and then used it as `MutableRefObject<PointerPosition>` only. Quality-gate
 * blocked promotion; the LLM-fixer ran four passes without finding the fix.
 *
 * Fix: rewrite the import to `import type { … }` when EVERY usage of the
 * imported binding falls in a type position. Conservative — when even one
 * usage looks like a value (function call, JSX element, member access,
 * `new`, `typeof`, …), the import is left alone. Mixed imports
 * (`import { Foo, Bar }`) only convert when ALL specifiers pass; we do not
 * split the import statement here (that is a riskier refactor better left
 * to the LLM-fixer).
 *
 * Scope is per-file, regex-based, side-effect-free. Runs in the per-file
 * loop after `react-type-import-fixer` so the React-specific rule can do
 * its dedicated work first.
 */

import type { FixEntry } from "../types";
import { bindingNameOf, indexIdentifierUsage, isUsedOnlyAsType } from "./type-value-position";

const IMPORT_RE =
  /^(\s*)import\s+\{\s*([^}]+?)\s*\}\s+from\s+(['"][^'"]+['"]);?\s*$/gm;

type FixResult = {
  code: string;
  fixed: boolean;
  fixes: FixEntry[];
};

export function fixTypeOnlyImports(code: string, filePath: string): FixResult {
  if (!code.includes("import")) return { code, fixed: false, fixes: [] };

  const usage = indexIdentifierUsage(code, filePath);
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const convertedSymbols: string[] = [];
  let match: RegExpExecArray | null;

  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(code)) !== null) {
    const [full, indent, specifierBlob, source] = match;
    const start = match.index;
    const end = match.index + full.length;

    // Skip imports already marked type-only.
    if (/^\s*type\b/.test(specifierBlob)) continue;

    // Never demote `lucide-react` icon glyphs to `import type`: they are
    // runtime React components, frequently referenced ONLY as a bare value in
    // a data/registry property (`{ icon: PawPrint }`) whose `:` this regex
    // classifier cannot tell apart from a type annotation (`mesh: Mesh`). A
    // type-only import is erased at build, so demoting it reintroduces the
    // `ReferenceError: <Icon> is not defined` white-screen the icon-value
    // import fixer exists to prevent. Lucide's genuine type exports
    // (`LucideIcon`, `LucideProps`, …) are already split into a separate
    // `import type` line upstream by `import-validator`, so this never strands
    // a real type-only lucide usage.
    if (/^['"]lucide-react['"]$/.test(source)) continue;

    // Tokenize specifiers, drop empty trailing comma noise.
    const specifierTokens = specifierBlob
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (specifierTokens.length === 0) continue;

    // If any individual specifier is itself prefixed `type Foo` we have a
    // mixed type-only spec block — leave such imports alone (rare, risky).
    if (specifierTokens.some((s) => /^type\s/.test(s))) continue;

    const bindings = specifierTokens.map(bindingNameOf);

    const allTypeOnly = bindings.every((binding) => isUsedOnlyAsType(usage, binding));
    if (!allTypeOnly) continue;

    const newImport = `${indent}import type { ${specifierBlob.trim()} } from ${source};`;
    if (newImport === full) continue;

    replacements.push({ start, end, text: newImport });
    convertedSymbols.push(...bindings);
  }

  if (replacements.length === 0) {
    return { code, fixed: false, fixes: [] };
  }

  replacements.sort((a, b) => b.start - a.start);
  let next = code;
  for (const r of replacements) {
    next = next.slice(0, r.start) + r.text + next.slice(r.end);
  }

  return {
    code: next,
    fixed: true,
    fixes: [
      {
        fixer: "type-only-import-fixer",
        category: "mechanical",
        description:
          convertedSymbols.length === 1
            ? `Converted 1 import to \`import type\` (type-only usage): ${convertedSymbols[0]}`
            : `Converted ${convertedSymbols.length} imports to \`import type\` (type-only usage): ${convertedSymbols.join(", ")}`,
        file: filePath,
      },
    ],
  };
}
