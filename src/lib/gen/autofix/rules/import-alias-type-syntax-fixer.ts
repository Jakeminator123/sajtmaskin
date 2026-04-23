/**
 * Import alias-type hybrid syntax fixer.
 *
 * Background: the LLM occasionally emits invalid TypeScript like
 *
 *   import {
 *     Trophy,
 *     Type as type LucideIcon,
 *   } from "lucide-react";
 *
 * This is a confused hybrid between two legitimate forms:
 *   - `import { type Type as LucideIcon } from "lucide-react"` (type-only,
 *     renamed)
 *   - `import { Type as LucideIcon } from "lucide-react"` (value + type,
 *     renamed)
 *
 * SWC/TS reject the stray `type` keyword between `as` and the alias
 * (`Expected ',', got 'ident'`). Empirically observed as a recurring
 * site-observability pattern:
 *
 *   "Expected \"}\" but found \"LucideIcon\"" — 3+ occurrences in
 *   `logs/site-observability/<chat>/history.ndjson` before this fixer
 *   landed. The existing `type-only-import-fixer` intentionally leaves
 *   specifiers with `type` prefix alone (see its rule 156), and the
 *   LLM-fixer lanes early-stop with `no_improvement` because no existing
 *   fixer touches this exact broken specifier syntax.
 *
 * Fix: inside any `import { ... } from "..."` statement, rewrite
 * `<Ident> as type <Ident>` specifiers to `<Ident> as <Ident>` —
 * i.e. drop the stray `type` keyword. This preserves the LLM's likely
 * intent (a renamed binding) while producing valid syntax. If the local
 * binding later turns out to be used only in type positions,
 * `type-only-import-fixer` will convert the entire import to
 * `import type { … }` in the same autofix pass.
 *
 * Scope: per-file, regex-based, side-effect-free. Runs in the pre-syntax
 * phase before `type-only-import-fixer` so the downstream fixer sees a
 * clean specifier list.
 */

import type { FixEntry } from "../types";

const IMPORT_RE =
  /import\s+(?:type\s+)?\{\s*([^}]+?)\s*\}\s+from\s+['"][^'"]+['"]/g;

const HYBRID_SPECIFIER_RE =
  /\b([A-Za-z_$][\w$]*)\s+as\s+type\s+([A-Za-z_$][\w$]*)\b/g;

type FixResult = {
  code: string;
  fixed: boolean;
  fixes: FixEntry[];
};

export function fixImportAliasTypeHybrid(
  code: string,
  filePath: string,
): FixResult {
  if (!code.includes("import")) return { code, fixed: false, fixes: [] };
  if (!code.includes("as type ")) return { code, fixed: false, fixes: [] };

  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const converted: string[] = [];
  let match: RegExpExecArray | null;

  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(code)) !== null) {
    const specifierBlob = match[1];
    const blobStart = match.index + match[0].indexOf(specifierBlob);
    if (!HYBRID_SPECIFIER_RE.test(specifierBlob)) continue;

    HYBRID_SPECIFIER_RE.lastIndex = 0;
    let rewrote = false;
    const fixedBlob = specifierBlob.replace(
      HYBRID_SPECIFIER_RE,
      (_m, source: string, alias: string) => {
        rewrote = true;
        converted.push(`${source} as ${alias}`);
        return `${source} as ${alias}`;
      },
    );

    if (rewrote) {
      replacements.push({
        start: blobStart,
        end: blobStart + specifierBlob.length,
        text: fixedBlob,
      });
    }
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
        fixer: "import-alias-type-syntax-fixer",
        category: "mechanical",
        description:
          converted.length === 1
            ? `Removed stray \`type\` keyword in import alias: ${converted[0]}`
            : `Removed stray \`type\` keyword in ${converted.length} import aliases: ${converted.join(", ")}`,
        file: filePath,
      },
    ],
  };
}
