/**
 * Value-used-from-type-import fixer (TS1361 — mirror of `type-only-import-fixer`).
 *
 * Background: when the LLM imports a binding via `import type { X }` but then
 * uses `X` in a **value position** (JSX tag, function call, object value,
 * `new X()`, `<X />`), TypeScript emits TS1361:
 *
 *   'X' cannot be used as a value because it was imported using 'import type'.
 *
 * Empirical hit (chat `341cdc37...`, version `f5ddfa39...`, 2026-04-23):
 * `app/showcase/page.tsx` shipped with
 *
 *   import type { Building2, Camera, Car as CarFront } from "lucide-react";
 *
 * and then used `icon: Building2` (data value) and `<CarFront />` (JSX).
 * The `/showcase` route rendered as a white page because Next bailed on the
 * TS1361. A 118s bakgrunds-repair-pass eventually fixed it via the LLM, but
 * the bug was fully mechanical and deserved a deterministic fixer.
 *
 * Fix: rewrite `import type { … }` back to plain `import { … }` when ANY
 * usage of one of the bindings is a value. Conservative: we only flip the
 * whole import block; we do not split it into `import type { A }` +
 * `import { B }` (that's a riskier refactor left to the LLM-fixer).
 *
 * Complements `type-only-import-fixer.ts`, which does the opposite direction
 * (`import { X }` → `import type { X }` when X is only used as a type).
 * Both fixers are per-file, regex-based, side-effect-free. Registration
 * order is important: this fixer runs **after** `type-only-import-fixer`
 * so we don't flip its correct conversions back.
 */

import type { FixEntry } from "../types";

const TYPE_IMPORT_RE =
  /^(\s*)import\s+type\s+\{\s*([^}]+?)\s*\}\s+from\s+(['"][^'"]+['"]);?\s*$/gm;

const VALUE_NEW_RE = /\bnew\s*$/;
const VALUE_TYPEOF_RE = /\btypeof\s+$/;
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
 * Same heuristic as `type-only-import-fixer.ts#classifyOccurrence` — we want
 * symmetric semantics so the two fixers never disagree on the same binding.
 */
function classifyOccurrence(
  code: string,
  idx: number,
  len: number,
): Classification {
  const before = code.slice(Math.max(0, idx - 32), idx);
  const after = code.slice(idx + len, idx + len + 24);

  if (VALUE_NEW_RE.test(before)) return "value";
  if (VALUE_TYPEOF_RE.test(before)) return "value";

  if (/^\s*\(/.test(after)) return "value"; // X(...)
  if (/^\s*\./.test(after)) return "value"; // X.member
  if (/^\s*=[^=>]/.test(after)) return "value";

  if (/<\s*$/.test(before)) {
    if (/^\s+\w+\s*=/.test(after)) return "value"; // <X attr=
    if (/^\s*\/\s*>/.test(after)) return "value"; // <X/>
    if (/^\s*>/.test(after)) {
      const past = after.slice(after.indexOf(">") + 1);
      if (/^\s*([;,)\]}|&]|$)/.test(past)) return "type";
      if (/^\s*[<{a-zA-Z0-9]/.test(past)) return "value";
      return "unknown";
    }
    if (/^\s*[,|&]/.test(after)) return "type";
    return "unknown";
  }

  if (TYPE_PRECEDER_RE.test(before)) return "type";

  return "unknown";
}

/** True if any reference to `symbol` in `code` looks like a value usage. */
function isUsedAsValue(code: string, symbol: string): boolean {
  const usageRe = new RegExp(`\\b${escapeRegex(symbol)}\\b`, "g");
  let match: RegExpExecArray | null;
  while ((match = usageRe.exec(code)) !== null) {
    const verdict = classifyOccurrence(code, match.index, symbol.length);
    if (verdict === "value") return true;
  }
  return false;
}

function bindingNameOf(specifier: string): string {
  const aliasMatch = specifier.match(
    /^[A-Za-z_$][\w$]*\s+as\s+([A-Za-z_$][\w$]*)\s*$/,
  );
  if (aliasMatch) return aliasMatch[1];
  return specifier.trim();
}

/**
 * Convert `import type { … }` → `import { … }` when at least one of the
 * bindings is used in a value position elsewhere in the file.
 */
export function fixValueUsedFromTypeImport(
  code: string,
  filePath: string,
): FixResult {
  if (!code.includes("import type")) {
    return { code, fixed: false, fixes: [] };
  }

  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const convertedSymbols: string[] = [];
  let match: RegExpExecArray | null;

  TYPE_IMPORT_RE.lastIndex = 0;
  while ((match = TYPE_IMPORT_RE.exec(code)) !== null) {
    const [full, indent, specifierBlob, source] = match;
    const start = match.index;
    const end = match.index + full.length;

    // Defensive: skip per-specifier `type` prefixes inside an `import type`
    // block (not valid TypeScript but we refuse to touch it).
    if (/\btype\s+/.test(specifierBlob)) continue;

    const specifierTokens = specifierBlob
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (specifierTokens.length === 0) continue;

    const bindings = specifierTokens.map(bindingNameOf);
    const restOfCode = code.slice(0, start) + code.slice(end);

    const anyValueUse = bindings.some((binding) =>
      isUsedAsValue(restOfCode, binding),
    );
    if (!anyValueUse) continue;

    const newImport = `${indent}import { ${specifierBlob.trim()} } from ${source};`;
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
        fixer: "value-used-from-type-import-fixer",
        category: "mechanical",
        description:
          convertedSymbols.length === 1
            ? `Converted 1 \`import type\` to value import (TS1361): ${convertedSymbols[0]}`
            : `Converted ${convertedSymbols.length} \`import type\` bindings to value imports (TS1361): ${convertedSymbols.join(", ")}`,
        file: filePath,
      },
    ],
  };
}
