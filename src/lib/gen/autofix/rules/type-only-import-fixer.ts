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

const IMPORT_RE =
  /^(\s*)import\s+\{\s*([^}]+?)\s*\}\s+from\s+(['"][^'"]+['"]);?\s*$/gm;

const VALUE_NEW_RE = /\bnew\s*$/;
const VALUE_TYPEOF_RE = /\btypeof\s+$/;
// Type-position preceders excluding `<`, which gets its own JSX-vs-generic
// disambiguation below.
const TYPE_PRECEDER_RE =
  /(?:[:,|&?]|\b(?:as|satisfies|extends|implements|keyof))\s*$/;

type FixResult = {
  code: string;
  fixed: boolean;
  fixes: FixEntry[];
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Classification = "type" | "value" | "unknown";

/**
 * Classify a single occurrence of `symbol` at offset `idx` in `code`.
 *
 * Conservative: returns `"unknown"` when the surrounding context does not
 * unambiguously indicate type-vs-value. Callers treat `"unknown"` as a
 * stop-signal (no conversion).
 */
function classifyOccurrence(
  code: string,
  idx: number,
  len: number,
): Classification {
  const before = code.slice(Math.max(0, idx - 32), idx);
  const after = code.slice(idx + len, idx + len + 24);

  // Strong value indicators (preceded by).
  if (VALUE_NEW_RE.test(before)) return "value";
  if (VALUE_TYPEOF_RE.test(before)) return "value";

  // Strong value indicators (followed by).
  if (/^\s*\(/.test(after)) return "value"; // X(...)
  if (/^\s*\./.test(after)) return "value"; // X.member
  // Bare `=` (assignment) but not `==`/`===`/`=>`.
  if (/^\s*=[^=>]/.test(after)) return "value";

  // `<` precedes — could be JSX `<Component …>` OR a type generic
  // `Wrapper<TypeArg>`. Disambiguate by what follows the symbol.
  if (/<\s*$/.test(before)) {
    if (/^\s+\w+\s*=/.test(after)) return "value"; // <X attr=
    if (/^\s*\/\s*>/.test(after)) return "value"; // <X/>
    if (/^\s*>/.test(after)) {
      // <X> — examine character past the `>`.
      const past = after.slice(after.indexOf(">") + 1);
      // Type-position terminators after the close: ; , ) ] } | & or end.
      if (/^\s*([;,)\]}|&]|$)/.test(past)) return "type";
      // Otherwise treat as JSX content (text, child element, mustache).
      if (/^\s*[<{a-zA-Z0-9]/.test(past)) return "value";
      return "unknown";
    }
    // <X followed by `,` (multi type arg `<X, Y>`) or `|`/`&` (union/inter
    // in conditional types). All type positions.
    if (/^\s*[,|&]/.test(after)) return "type";
    return "unknown";
  }

  // Other type-position preceders.
  if (TYPE_PRECEDER_RE.test(before)) return "type";

  return "unknown";
}

/**
 * Heuristically classify whether `symbol` is referenced only in TypeScript
 * type positions in `code`. Conservative: returns false if any reference
 * looks like a value usage OR if any reference cannot be classified.
 */
function isUsedOnlyAsType(code: string, symbol: string): boolean {
  const usageRe = new RegExp(`\\b${escapeRegex(symbol)}\\b`, "g");
  let usageCount = 0;
  let typeUsageCount = 0;
  let match: RegExpExecArray | null;

  while ((match = usageRe.exec(code)) !== null) {
    usageCount += 1;
    const verdict = classifyOccurrence(code, match.index, symbol.length);
    if (verdict === "value") return false;
    if (verdict === "unknown") return false;
    typeUsageCount += 1;
  }

  return usageCount > 0 && typeUsageCount === usageCount;
}

function bindingNameOf(specifier: string): string {
  // `Foo` or `Foo as Bar` — only the local binding (`Bar`) is referenced.
  const aliasMatch = specifier.match(/^[A-Za-z_$][\w$]*\s+as\s+([A-Za-z_$][\w$]*)\s*$/);
  if (aliasMatch) return aliasMatch[1];
  return specifier.trim();
}

export function fixTypeOnlyImports(code: string, filePath: string): FixResult {
  if (!code.includes("import")) return { code, fixed: false, fixes: [] };

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
    const restOfCode = code.slice(0, start) + code.slice(end);

    const allTypeOnly = bindings.every((binding) =>
      isUsedOnlyAsType(restOfCode, binding),
    );
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
