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
 * The INLINE specifier form is handled too (prod chat `85f8db72`, 2026-07-29:
 * `components/booking-form.tsx` type-only-imported `sv` and used it as the
 * `locale:` value — the repair gave up because only the statement form was
 * covered). `import { format, type sv } from "date-fns"` with `sv` used as a
 * value gets the `type` keyword stripped from exactly that specifier; the
 * other specifiers are left byte-identical.
 *
 * Complements `type-only-import-fixer.ts`, which does the opposite direction
 * (`import { X }` → `import type { X }` when X is only used as a type).
 * Both fixers are per-file, regex-based, side-effect-free. Registration
 * order is important: this fixer runs **after** `type-only-import-fixer`
 * so we don't flip its correct conversions back.
 */

import type { FixEntry } from "../types";
import { bindingNameOf, indexIdentifierUsage, isUsedAsValue } from "./type-value-position";

const TYPE_IMPORT_RE =
  /^(\s*)import\s+type\s+\{\s*([^}]+?)\s*\}\s+from\s+(['"][^'"]+['"]);?\s*$/gm;

// Value import statements that may carry INLINE `type` specifiers:
//   import { format, type sv } from "date-fns";
//   import React, { type FC, useState } from "react";
// The lookahead excludes `import type { … }` statements (owned by
// TYPE_IMPORT_RE above).
const VALUE_IMPORT_WITH_SPECIFIERS_RE =
  /^(\s*)import\s+(?!type[\s{])(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s+from\s+(['"][^'"]+['"]);?\s*$/gm;

// One inline `type X` / `type X as Y` specifier (whitespace preserved around it).
const INLINE_TYPE_SPECIFIER_RE = /^(\s*)type\s+([\s\S]*?)(\s*)$/;

// Cheap probe so files without any type-flavoured import skip the AST parse.
const IMPORT_WITH_TYPE_PROBE_RE = /(?:^|\n)\s*import\s[^;]*?\btype\s/;

type FixResult = {
  code: string;
  fixed: boolean;
  fixes: FixEntry[];
  /** Local bindings whose type-only import was converted to a value import. */
  convertedSymbols: string[];
};

/**
 * Convert `import type { … }` → `import { … }` when at least one of the
 * bindings is used in a value position elsewhere in the file.
 *
 * `forceValueSymbols` lets a diagnostic-driven caller (the repair-loop's
 * deterministic import-repair) override the local analysis for symbols the
 * TypeScript compiler has *already confirmed* are used as values (TS1361). It
 * still matters after the switch to an AST: a file with parse errors yields no
 * usable analysis, and the compiler's verdict is authoritative regardless.
 */
export function fixValueUsedFromTypeImport(
  code: string,
  filePath: string,
  forceValueSymbols?: ReadonlySet<string>,
): FixResult {
  if (!IMPORT_WITH_TYPE_PROBE_RE.test(code)) {
    return { code, fixed: false, fixes: [], convertedSymbols: [] };
  }

  const usage = indexIdentifierUsage(code, filePath);
  const shouldFlip = (binding: string): boolean =>
    (forceValueSymbols?.has(binding) ?? false) || isUsedAsValue(usage, binding);
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

    const anyValueUse = bindings.some(shouldFlip);
    if (!anyValueUse) continue;

    const newImport = `${indent}import { ${specifierBlob.trim()} } from ${source};`;
    if (newImport === full) continue;

    replacements.push({ start, end, text: newImport });
    convertedSymbols.push(...bindings);
  }

  // Inline form: strip the `type` keyword from exactly the specifiers whose
  // binding is used as a value (or compiler-confirmed via `forceValueSymbols`).
  // Everything else in the statement stays byte-identical.
  VALUE_IMPORT_WITH_SPECIFIERS_RE.lastIndex = 0;
  while ((match = VALUE_IMPORT_WITH_SPECIFIERS_RE.exec(code)) !== null) {
    const full = match[0];
    const specifierBlob = match[2];
    if (!/\btype\s/.test(specifierBlob)) continue;

    const flipped: string[] = [];
    const newBlob = specifierBlob
      .split(",")
      .map((part) => {
        const inline = part.match(INLINE_TYPE_SPECIFIER_RE);
        if (!inline) return part;
        const binding = bindingNameOf(inline[2].trim());
        if (!binding || !shouldFlip(binding)) return part;
        flipped.push(binding);
        return `${inline[1]}${inline[2]}${inline[3]}`;
      })
      .join(",");
    if (flipped.length === 0) continue;

    const braceOpen = full.indexOf("{");
    const braceClose = full.lastIndexOf("}");
    if (braceOpen < 0 || braceClose <= braceOpen) continue;
    const newImport =
      full.slice(0, braceOpen + 1) + newBlob + full.slice(braceClose);
    if (newImport === full) continue;

    replacements.push({
      start: match.index,
      end: match.index + full.length,
      text: newImport,
    });
    convertedSymbols.push(...flipped);
  }

  if (replacements.length === 0) {
    return { code, fixed: false, fixes: [], convertedSymbols: [] };
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
    convertedSymbols,
  };
}
