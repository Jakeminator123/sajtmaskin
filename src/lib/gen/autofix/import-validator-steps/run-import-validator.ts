import {
  countParseErrors,
  findIntroducedDuplicateImportBindings,
  isGuardablePath,
} from "../rules/import-binding-ast";
import type { AutoFixEntry } from "../pipeline";
import { fixDuplicateDefaultExport } from "./duplicate-default-export";
import { fixMissingIconValueImports } from "./icon-value-imports";
import { fixLucideImports } from "./lucide-imports";
import { fixNestedImportBlocks } from "./nested-import-blocks";
import { detectMissingImports } from "./missing-imports";
import { fixRadixImports, fixRadixSlotUsage } from "./radix-imports";
import { fixShadcnImports } from "./shadcn-imports";
import { validateImports } from "./import-statements";

export function runImportValidator(code: string): {
  code: string;
  fixes: AutoFixEntry[];
  warnings: string[];
} {
  const nested = fixNestedImportBlocks(code);
  const dupExport = fixDuplicateDefaultExport(nested.code);
  const shadcn = fixShadcnImports(dupExport.code);
  const lucide = fixLucideImports(shadcn.code);
  const radix = fixRadixImports(lucide.code);
  const slot = fixRadixSlotUsage(radix.code);
  const missing = detectMissingImports(slot.code);
  // Runs AFTER the JSX scan so a JSX-added lucide import is already present in
  // `missing.code` and the bare `icon:` value reference is not imported twice.
  const iconValues = fixMissingIconValueImports(missing.code);
  const fixes = [...nested.fixes, ...dupExport.fixes, ...shadcn.fixes, ...lucide.fixes, ...radix.fixes, ...slot.fixes, ...missing.fixes, ...iconValues.fixes];
  const warnings = validateImports(iconValues.code);
  return { code: iconValues.code, fixes, warnings };
}

/**
 * Canonical, **guarded** entry for `runImportValidator` in runtime paths.
 *
 * The raw `runImportValidator` rewrites imports with regex/line surgery and is
 * the highest-corruption-risk mechanical step (per the autofix deep-audit). On
 * BOTH the CodeProject `runAutoFix` pass AND the post-merge
 * `repairGeneratedFiles()` path (finalize-preflight / preview-session /
 * preview-render / export), it must never leave a file LESS parseable than it
 * found it.
 *
 * This wrapper re-checks the result with the synchronous TypeScript parser and
 * **reverts** the import-validator output when it either
 *
 *   1. turned parseable input into unparseable output, or
 *   2. INTRODUCED duplicate import bindings — the same local name declared by
 *      2+ import statements (TS2300; e.g. a JSX-scan injection duplicating a
 *      binding that already exists in a multi-line import the line-based scan
 *      could not see). Cheap parser-based post-check per file.
 *
 * — keeping the pre-fixer content and recording a warning in both cases.
 * It deliberately does NOT revert when the input was already unparseable /
 * already duplicated: that upstream model/stream breakage must stay visible to
 * the syntax-validator / preflight gate rather than be masked here.
 *
 * Runtime callers MUST use this instead of `runImportValidator` directly so the
 * fixer can never run unguarded. (`runImportValidator` stays exported only for
 * focused unit tests of the underlying transforms.)
 */
export function runImportValidatorGuarded(
  code: string,
  filePath: string,
  /** Injectable for tests; defaults to the real `runImportValidator`. */
  runner: (code: string) => {
    code: string;
    fixes: AutoFixEntry[];
    warnings: string[];
  } = runImportValidator,
): {
  code: string;
  fixes: AutoFixEntry[];
  warnings: string[];
  reverted: boolean;
} {
  const result = runner(code);
  if (result.code === code) {
    return { ...result, reverted: false };
  }
  // Guard all TS/JS dialects incl. module-suffixed paths (.mjs/.cjs/.mts/.cts);
  // runAutoFixSinglePass enters import-validator by fence language, so these
  // must not bypass the guard. Shared with the jsx-checker guard.
  if (!isGuardablePath(filePath)) {
    return { ...result, reverted: false };
  }

  const errorsAfter = countParseErrors(result.code, filePath);
  if (errorsAfter === 0) {
    // Parse-clean output can still be semantically broken: an injection branch
    // may have re-declared a binding that already existed in an import shape
    // its line-based scan cannot see (multi-line import). Revert when the
    // fixer INTRODUCED duplicate import bindings; pre-existing duplicates are
    // left alone (upstream breakage stays visible downstream).
    const introducedDuplicates = findIntroducedDuplicateImportBindings(
      code,
      result.code,
      filePath,
    );
    if (introducedDuplicates.length === 0) {
      return { ...result, reverted: false };
    }
    return {
      code,
      fixes: [],
      warnings: [
        ...result.warnings,
        `import-validator reverted: it introduced duplicate import binding(s) ` +
          `(${introducedDuplicates.join(", ")}) — kept pre-fixer content`,
      ],
      reverted: true,
    };
  }

  const errorsBefore = countParseErrors(code, filePath);
  if (errorsBefore > 0) {
    // Pre-existing breakage — not import-validator's fault. Keep its output so
    // the broken state still flows downstream to preflight/diagnostics.
    return { ...result, reverted: false };
  }

  return {
    code,
    fixes: [],
    warnings: [
      ...result.warnings,
      `import-validator reverted: it made a parseable file unparseable ` +
        `(${errorsAfter} parser error(s)) — kept pre-fixer content`,
    ],
    reverted: true,
  };
}
