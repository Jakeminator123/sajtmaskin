import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import { LUCIDE_ICONS } from "@/lib/gen/data/lucide-icons";
import type { AutoFixEntry } from "../pipeline";
import { collectImportBoundNames } from "./bound-names";
import { NEXT_AUTO_IMPORTS } from "./known-imports";

// ---------------------------------------------------------------------------
// Non-JSX lucide value usage: `icon: PawPrint` in a data/registry object.
// ---------------------------------------------------------------------------

/**
 * `icon:`/`Icon:` (or any `*icon:` key like `activeIcon:`) whose value is a
 * bare PascalCase identifier — the "icon registry" idiom:
 *
 *   const MOTIFS = [{ label: "Trail", icon: PawPrint }];
 *
 * `detectMissingImports` above only scans JSX (`<PawPrint/>`), so this value
 * reference slips through on the deterministic export/preview path. There is no
 * tsc there to trigger `ts2304-known-import-fixer`, so a missing import ships as
 * a runtime `ReferenceError: PawPrint is not defined` (white screen). Captured
 * group 1 is the candidate icon name.
 */
const ICON_PROPERTY_VALUE_RE = /\b[A-Za-z]*[Ii]con\s*:\s*([A-Z][A-Za-z0-9]*)\b/g;

/**
 * JSX-prop form of the same idiom: an icon component passed as a prop value,
 *
 *   <FeatureCard icon={PawPrint} />
 *
 * Like the `icon:` object form, `detectMissingImports` (a JSX *tag* scan) never
 * sees `PawPrint` here, so on the deterministic export/preview path (no tsc to
 * drive `ts2304-known-import-fixer`) a missing import ships as a runtime
 * `ReferenceError` / white screen. Only a BARE PascalCase identifier between the
 * braces is matched — `icon={<PawPrint/>}` (already covered by the JSX-tag scan)
 * and `icon={Icons.PawPrint}` (member access) are intentionally NOT matched, so
 * this never double-imports. Captured group 1 is the candidate icon name.
 */
const ICON_PROPERTY_JSX_VALUE_RE = /\b[A-Za-z]*[Ii]con\s*=\s*\{\s*([A-Z][A-Za-z0-9]*)\s*\}/g;

/**
 * Names bound by import statements, split into VALUE bindings and TYPE-ONLY
 * bindings (M#cr1). `import type { PawPrint }` (or an inline `type PawPrint`
 * specifier) is erased at build — a bare `icon: PawPrint` value usage still
 * ships a TS1361/`ReferenceError` unless the binding is converted to a value
 * import. Treating both kinds as "already imported" (the old single-Set
 * behaviour) silently skipped exactly the file that needed fixing.
 *
 * Multi-line aware since M#imp1 (prod chat cc10e7de v8): delegates to the
 * whole-text collector so a multi-line lucide import block's bindings are
 * seen — the old per-line scan re-imported six already-imported icons, which
 * made the guarded wrapper revert the whole import-validator result.
 */
function collectImportedBindings(code: string): {
  value: Set<string>;
  typeOnly: Set<string>;
} {
  return collectImportBoundNames(code);
}

/**
 * Convert a type-only lucide binding into a value binding (M#cr1). Handles:
 *  - inline spec in a value import: `import { type PawPrint, Menu } from
 *    "lucide-react"` → strip the `type` keyword (done — no further add needed);
 *  - whole-statement `import type { PawPrint } from "lucide-react"` with a
 *    single spec → flip the statement to a value import (done);
 *  - whole-statement with multiple specs → remove the name from the type
 *    import and report `needsValueImport: true` so the caller adds the value
 *    import.
 *
 * MULTI-LINE aware (Codex P2 on PR #378): statements are gathered as line
 * RANGES (opener → `} from "…"` closer), so `import type {\n  PawPrint,\n}
 * from "lucide-react"` converts too. Before this, the multi-line-aware
 * binding collector correctly classified the name type-only but this
 * converter only understood single lines → returned null → the caller
 * skipped the value fix entirely and the TS1361/runtime failure shipped.
 * A converted/edited statement is re-emitted single-line — downstream
 * parse/dedupe receipts validate the result.
 *
 * Only lucide-react imports are converted — a type binding from any other
 * module is a different symbol and is left for the LLM fixer (returns null).
 */
function convertLucideTypeImportToValue(
  code: string,
  name: string,
): { code: string; needsValueImport: boolean } | null {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*import\s/.test(line)) continue;

    // Gather the full statement range: single line, or opener → closer.
    let end = i;
    if (line.includes("{") && !/from\s+["']/.test(line)) {
      while (end < lines.length - 1 && !/\}\s*from\s+["']/.test(lines[end])) end++;
    }
    const stmt = lines.slice(i, end + 1).join("\n");
    if (!stmt.includes("lucide-react")) {
      i = end;
      continue;
    }

    // Inline `type Name` spec inside a VALUE import statement.
    if (/^\s*import\s*\{/.test(line) && !/^\s*import\s+type\s/.test(line)) {
      const inlineRe = new RegExp(`(\\{[\\s\\S]*?)\\btype\\s+(${n})\\b`);
      if (inlineRe.test(stmt)) {
        lines.splice(i, end - i + 1, ...stmt.replace(inlineRe, "$1$2").split("\n"));
        return { code: lines.join("\n"), needsValueImport: false };
      }
      i = end;
      continue;
    }

    // Whole-statement `import type { … } from "lucide-react"`.
    const whole = stmt.match(
      /^(\s*import\s+)type\s*\{([\s\S]*?)\}(\s*from\s+["']lucide-react["'].*)$/,
    );
    if (!whole) {
      i = end;
      continue;
    }
    const specs = whole[2]
      .split(",")
      .map((spec) => spec.trim())
      .filter(Boolean);
    if (!specs.includes(name)) {
      i = end;
      continue;
    }
    if (specs.length === 1) {
      lines.splice(i, end - i + 1, `${whole[1]}{ ${name} }${whole[3]}`);
      return { code: lines.join("\n"), needsValueImport: false };
    }
    const remaining = specs.filter((spec) => spec !== name);
    lines.splice(i, end - i + 1, `${whole[1]}type { ${remaining.join(", ")} }${whole[3]}`);
    return { code: lines.join("\n"), needsValueImport: true };
  }
  return null;
}

/**
 * True when the file declares or re-exports `name` locally, so the `icon:`
 * value is a local symbol — NOT a lucide icon that needs importing. Mirrors the
 * guard in `ts2304-known-import-fixer.ts` to avoid shadowing a local binding.
 */
function fileDeclaresSymbolLocally(code: string, name: string): boolean {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Runtime-value local declarations win over a lucide import: importing the
  // icon would duplicate the binding (TS2440 / esbuild "already declared"). This
  // includes `enum` / `const enum`, which (unlike `type`/`interface`) emit a
  // runtime value object. `type`/`interface` are intentionally NOT matched —
  // they are erased at build, so a bare `icon: X` value reference genuinely
  // needs the lucide value import; skipping it would ship a runtime
  // `ReferenceError` (the white-screen this fixer exists to prevent).
  const kw = "(?:function|const\\s+enum|enum|const|let|var|class)";
  const declaration = new RegExp(
    `(?:^|\\n)\\s*export\\s+(?:default\\s+)?(?:async\\s+)?${kw}\\s+${n}\\b` +
      `|(?:^|\\n)\\s*(?:async\\s+)?${kw}\\s+${n}\\b`,
  );
  if (declaration.test(code)) return true;
  // M#cr2 / BB#296: destructuring and parameter bindings also declare the
  // name locally. Without these, `const { icon: PawPrint } = x` or
  // `function Card({ icon: PawPrint })` matched the icon-value regexes above
  // and got a DUPLICATE lucide import injected (TS2440 — semantic, not a
  // parse error, so the guarded wrapper does not revert it on the
  // export/preview path).
  //  - variable destructuring: `const { icon: PawPrint } = …` / `const { PawPrint } = …`
  const destructuring = new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?(?:const|let|var)\\s*\\{[^}]*\\b(?:\\w+\\s*:\\s*)?${n}\\b[^}]*\\}\\s*=`,
  );
  if (destructuring.test(code)) return true;
  //  - parameter destructuring: `function Card({ icon: PawPrint, … })` and
  //    arrow components `const Card = ({ icon: PawPrint }) => …`. A CALL with
  //    an object literal (`fn({ icon: PawPrint })`) deliberately does NOT match:
  //    there the `(` follows an identifier, not `function name` or `=`.
  const paramDestructuring = new RegExp(
    `function\\s+[A-Za-z_$][\\w$]*\\s*\\(\\s*\\{[^)]*\\b(?:\\w+\\s*:\\s*)?${n}\\b` +
      `|=\\s*(?:async\\s*)?\\(\\s*\\{[^)]*\\b(?:\\w+\\s*:\\s*)?${n}\\b`,
  );
  if (paramDestructuring.test(code)) return true;
  return new RegExp(`export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(code);
}

/**
 * Add a missing `lucide-react` value import for icons used only as a bare value
 * in an `icon:` property or an `icon={...}` JSX prop (no JSX-tag usage).
 * Narrowly scoped to avoid false
 * positives on common-word icon names (`Box`, `Text`, `Image`, …): the name
 * must be a real lucide icon, NOT already imported, NOT declared locally, NOT a
 * Next default-import name (`Image`/`Link`/`Metadata`), and NOT a shadcn
 * component. Merges into an existing value `import { … } from "lucide-react"`
 * line when present, otherwise inserts a fresh import.
 */
export function fixMissingIconValueImports(code: string): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];
  ICON_PROPERTY_VALUE_RE.lastIndex = 0;
  ICON_PROPERTY_JSX_VALUE_RE.lastIndex = 0;
  const candidates = new Set<string>();
  for (const m of code.matchAll(ICON_PROPERTY_VALUE_RE)) {
    candidates.add(m[1]);
  }
  for (const m of code.matchAll(ICON_PROPERTY_JSX_VALUE_RE)) {
    candidates.add(m[1]);
  }
  if (candidates.size === 0) return { code, fixes };

  const imported = collectImportedBindings(code);
  const toAdd: string[] = [];
  let working = code;
  for (const name of candidates) {
    if (!LUCIDE_ICONS.has(name)) continue; // must be a real lucide icon
    if (NEXT_AUTO_IMPORTS[name]) continue; // Image/Link/Metadata → next/*, not lucide
    if (name in SHADCN_COMPONENTS) continue; // avoid shadcn-component collision
    if (imported.value.has(name)) continue; // already value-imported (incl. JSX fixer above)
    if (fileDeclaresSymbolLocally(code, name)) continue; // local symbol, not lucide
    if (imported.typeOnly.has(name)) {
      // M#cr1: `import type { PawPrint }` + `icon: PawPrint` — the type
      // binding is erased at build, so convert it to a value import instead
      // of adding a duplicate binding (TS2300/TS2440).
      const converted = convertLucideTypeImportToValue(working, name);
      if (!converted) continue; // type-imported from a non-lucide module — leave for the LLM
      working = converted.code;
      if (!converted.needsValueImport) {
        fixes.push({
          fixer: "import-validator",
          description: `Converted type-only lucide import to value import for icon property: ${name}`,
          line: 0,
        });
        continue;
      }
      // Name removed from the multi-spec type line — fall through to add the
      // value import below.
    }
    if (!toAdd.includes(name)) toAdd.push(name);
  }
  if (toAdd.length === 0) return { code: working, fixes };

  const lines = working.split("\n");
  // Merge ONLY into a value named import, never `import type { … }` (that would
  // make the icon type-only and re-break the value usage with TS1361).
  const existingIdx = lines.findIndex(
    (l) =>
      (l.includes('from "lucide-react"') || l.includes("from 'lucide-react'")) &&
      /^\s*import\s+\{/.test(l) &&
      !/^\s*import\s+type\s/.test(l),
  );

  if (existingIdx >= 0) {
    const braceMatch = lines[existingIdx].match(/^(\s*import\s+\{)([^}]*)(\}\s+from\s+.+)$/);
    if (braceMatch) {
      const existingSpecs = braceMatch[2]
        .split(",")
        .map((spec) => spec.trim())
        .filter(Boolean);
      const newOnes = toAdd.filter((name) => !existingSpecs.includes(name));
      if (newOnes.length > 0) {
        // Strip a trailing comma off the existing specifiers before re-joining
        // so an `import { Menu, }` line does not become `import { Menu,, … }`
        // (an empty specifier → TS1109 parse error).
        const head = braceMatch[2].replace(/\s+$/, "").replace(/,$/, "");
        lines[existingIdx] = `${braceMatch[1]}${head}, ${newOnes.join(", ")} ${braceMatch[3]}`;
        fixes.push({
          fixer: "import-validator",
          description: `Added missing lucide value import(s) for icon property: ${newOnes.join(", ")}`,
          line: existingIdx + 1,
        });
      }
      return { code: lines.join("\n"), fixes };
    }
  }

  // Fresh import: insert at a safe top-of-file position — after any leading
  // directive prologue (`"use client"` / `"use server"`) and the comment/blank
  // lines that may surround it, but BEFORE the first import/code line. The
  // directive MUST stay the first *statement* (Next.js only honours it when no
  // statement precedes it), so we skip leading `//` and `/* … */` comments too:
  // a `"use client"` preceded by a header comment, or carrying a trailing
  // comment, must NOT get the lucide import hoisted above it (that would demote
  // the file to a Server Component — a silent, parse-clean regression the
  // guarded wrapper cannot catch). We deliberately do NOT advance past an
  // `import {` opener: a multi-line lucide block (`import {\n Menu,\n} from
  // "lucide-react"`) has no single-line value import for the merge above to find,
  // and the previous logic spliced the new line between the opener and its
  // `} from "…"` closer — corrupting the file (then reverted by the guarded
  // wrapper, silently dropping the import and re-shipping the white screen).
  let insertIdx = 0;
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (inBlockComment) {
      insertIdx = i + 1;
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }
    if (trimmed === "") {
      insertIdx = i + 1;
      continue;
    }
    if (trimmed.startsWith("//")) {
      insertIdx = i + 1;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      insertIdx = i + 1;
      // A single-line `/* … */` closes on the same line; otherwise keep
      // skipping until the line that contains the `*/` terminator.
      if (!trimmed.includes("*/")) inBlockComment = true;
      continue;
    }
    // Leading directive prologue, tolerating a trailing `//` or `/* … */`
    // comment after the (optional) semicolon.
    if (/^["'`]use [^"'`]+["'`]\s*;?\s*(?:\/\/.*|\/\*.*?\*\/\s*)?$/.test(trimmed)) {
      insertIdx = i + 1;
      continue;
    }
    break;
  }
  lines.splice(insertIdx, 0, `import { ${toAdd.join(", ")} } from "lucide-react"`);
  fixes.push({
    fixer: "import-validator",
    description: `Added missing lucide value import(s) for icon property: ${toAdd.join(", ")}`,
    line: 0,
  });
  return { code: lines.join("\n"), fixes };
}
