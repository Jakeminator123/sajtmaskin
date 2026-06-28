/**
 * Deterministic, diagnostic-driven import repair — runs BEFORE the LLM fixer in
 * the server repair loop.
 *
 * Why this exists (prod telemetry, 2026-06): of the versions whose preview-host
 * quality gate failed on `tsc --noEmit`, **none** were ever promoted. The
 * dominant failures are import-only and already have mechanical owners that run
 * blind inside `runAutoFix()` — yet they still reach the gate because the blind
 * heuristics are ambiguous:
 *
 *   - TS2304 / TS2552  missing import (shadcn `Button`/`Badge`, Clerk server
 *                      helpers, Stripe) — the resolver didn't know the symbol.
 *   - TS1361           `import type { X }` used as a value — the value/type
 *                      classifier misreads object-literal `{ icon: X }`.
 *   - TS2440           import declaration conflicts with a local declaration
 *                      (self-import of the same module path).
 *   - TS2300           duplicate identifier (same symbol imported twice).
 *
 * The TypeScript diagnostics produced by the gate remove that ambiguity: they
 * name the exact symbol + file. This module consumes those diagnostics and
 * dispatches each one to the *existing* fixer with the exact target, so the LLM
 * fixer only has to handle the genuine residue. It deliberately reuses the
 * canonical owners instead of duplicating fix logic:
 *
 *   - `fixKnownTs2304Imports`               (TS2304 / TS2552)
 *   - `fixValueUsedFromTypeImport`          (TS1361, with confirmed symbols)
 *   - `fixImportedDeclarationConflicts`     (TS2440, path-aware self-import)
 *   - `fixDuplicateImportBindings`          (TS2300)
 *   - `fixDuplicateImportAndLocalTypeCollision` (TS2300 / TS2440 type collision)
 *
 * Conservative by design: only the five import-only codes above are touched.
 * Logic/type errors (TS2554, TS7006, TS7009, generic mismatch) are left for the
 * LLM. Every fixer here is idempotent, so a second run is a no-op.
 */

import { parseCodeProject, serializeCodeProject } from "@/lib/gen/parser";
import { fixKnownTs2304Imports } from "@/lib/gen/autofix/rules/ts2304-known-import-fixer";
import { fixValueUsedFromTypeImport } from "@/lib/gen/autofix/rules/value-used-from-type-import-fixer";
import { fixImportedDeclarationConflicts } from "@/lib/gen/autofix/common-import-fixer";
import { fixDuplicateImportBindings } from "@/lib/gen/autofix/rules/duplicate-import-binding-fixer";
import { fixDuplicateImportAndLocalTypeCollision } from "@/lib/gen/autofix/rules/duplicate-import-local-type-collision-fixer";
import type { FixEntry } from "@/lib/gen/autofix/types";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";
import { type ParsedRepairDiagnostic, toPosixPath } from "./diagnostics-parser";

// TS2304 ("Cannot find name 'X'.") and TS2552 (the "...Did you mean 'Y'?"
// spelling-suggestion variant) are distinct tsc codes that the known-import
// fixer resolves the same way. The parsed diagnostic only carries the message
// (the leading `TSxxxx` code is stripped upstream), so the code is recovered
// from the message text; the capture group yields the missing name used to
// label telemetry per resolved import.
const CANNOT_FIND_NAME_RE = /Cannot find name '([^']+)'/;
const CANNOT_FIND_NAME_DID_YOU_MEAN_RE =
  /Cannot find name '[^']+'\.\s*Did you mean /;
const TS1361_RE =
  /'([^']+)' cannot be used as a value because it was imported using 'import type'/;
const DUPLICATE_IDENTIFIER_RE = /Duplicate identifier '[^']+'/;
const IMPORT_CONFLICT_RE =
  /Import declaration conflicts with local declaration of '[^']+'/;

export interface DeterministicImportRepairResult {
  content: string;
  fixed: boolean;
  fixes: FixEntry[];
  /** Distinct TS codes a fixer actually resolved (for telemetry). */
  handledCodes: string[];
}

export interface DeterministicImportRepairOptions {
  /**
   * The version's preview policy. Tier-3 backend SDK imports (stripe, Clerk
   * server, …) are only re-introduced when `"fidelity3"` (F3). In F2 / unknown
   * they stay residual so the F2/F3 contract is never violated by a silent
   * deterministic promotion. Defaults to F2-safe behaviour.
   */
  previewPolicy?: BuildSpecPreviewPolicy;
}

function ensureSet<K>(map: Map<K, Set<string>>, key: K): Set<string> {
  let value = map.get(key);
  if (!value) {
    value = new Set<string>();
    map.set(key, value);
  }
  return value;
}

/**
 * Apply deterministic import-only fixes for the diagnostics the gate produced.
 * Returns the original content unchanged when nothing resolvable is found.
 */
export function runDeterministicImportRepair(
  content: string,
  diagnostics: ReadonlyArray<ParsedRepairDiagnostic>,
  options: DeterministicImportRepairOptions = {},
): DeterministicImportRepairResult {
  // F3 (integrations build) is the only stage allowed to (re)introduce tier-3
  // backend SDK imports. F2 / unknown → keep them residual (P1 contract guard).
  const allowTier3 = options.previewPolicy === "fidelity3";
  // Bucket diagnostics by the fixer they drive.
  const ts2304Diagnostics: ParsedRepairDiagnostic[] = [];
  const ts1361SymbolsByFile = new Map<string, Set<string>>();
  const conflictFiles = new Set<string>();
  const duplicateIdentifierFiles = new Set<string>();
  // Missing name → the distinct cannot-find-name code(s) the gate reported for
  // it (TS2304 and/or its TS2552 "did you mean" variant). Both drive the same
  // known-import fixer, but telemetry must record the *actual* code, so a
  // resolved import is labelled from here instead of always as TS2304.
  const cannotFindNameCodes = new Map<string, Set<string>>();

  for (const diagnostic of diagnostics) {
    const file = toPosixPath(diagnostic.file);
    if (!file) continue;
    const cannotFindName = diagnostic.message.match(CANNOT_FIND_NAME_RE);
    if (cannotFindName) {
      ts2304Diagnostics.push(diagnostic);
      const code = CANNOT_FIND_NAME_DID_YOU_MEAN_RE.test(diagnostic.message)
        ? "TS2552"
        : "TS2304";
      ensureSet(cannotFindNameCodes, cannotFindName[1]).add(code);
      continue;
    }
    const ts1361 = diagnostic.message.match(TS1361_RE);
    if (ts1361) {
      ensureSet(ts1361SymbolsByFile, file).add(ts1361[1]);
      continue;
    }
    if (IMPORT_CONFLICT_RE.test(diagnostic.message)) {
      conflictFiles.add(file);
      continue;
    }
    if (DUPLICATE_IDENTIFIER_RE.test(diagnostic.message)) {
      duplicateIdentifierFiles.add(file);
      continue;
    }
  }

  let working = content;
  const fixes: FixEntry[] = [];
  const handledCodes = new Set<string>();

  // 1) TS2304 / TS2552 — whole-project, diagnostic-driven known-import fixer.
  if (ts2304Diagnostics.length > 0) {
    const result = fixKnownTs2304Imports(working, ts2304Diagnostics, { allowTier3 });
    if (result.addedImports.length > 0) {
      working = result.code;
      for (const fix of result.fixes) {
        fixes.push({ ...fix, category: "mechanical" });
      }
      // Record the actual code each resolved name was reported under, so a
      // TS2552 "did you mean" fix is counted as TS2552 rather than folded into
      // TS2304. Falls back to TS2304 if a resolved name was somehow never
      // classified, preserving the invariant that a fix always records a code.
      for (const addition of result.addedImports) {
        const codes = cannotFindNameCodes.get(addition.name);
        if (codes && codes.size > 0) {
          for (const code of codes) handledCodes.add(code);
        } else {
          handledCodes.add("TS2304");
        }
      }
    }
  }

  // 2) Per-file fixers (TS1361 / TS2440 / TS2300) — only touch files the gate
  //    actually flagged, using the symbol the compiler named where relevant.
  const needsPerFilePass =
    ts1361SymbolsByFile.size > 0 ||
    conflictFiles.size > 0 ||
    duplicateIdentifierFiles.size > 0;

  if (needsPerFilePass) {
    const project = parseCodeProject(working);
    if (project.files.length > 0) {
      let projectChanged = false;
      const fixedFiles = project.files.map((file) => {
        const posix = toPosixPath(file.path);
        let code = file.content;
        let changed = false;

        const forcedValueSymbols = ts1361SymbolsByFile.get(posix);
        if (forcedValueSymbols && forcedValueSymbols.size > 0) {
          const result = fixValueUsedFromTypeImport(
            code,
            file.path,
            forcedValueSymbols,
          );
          if (result.fixed) {
            code = result.code;
            fixes.push(...result.fixes);
            handledCodes.add("TS1361");
            changed = true;
          }
        }

        if (conflictFiles.has(posix)) {
          const result = fixImportedDeclarationConflicts(code, file.path);
          if (result.fixed) {
            code = result.code;
            fixes.push({
              fixer: "import-declaration-conflict-fixer",
              category: "mechanical",
              description: `Dropped import(s) conflicting with local declaration (TS2440): ${result.removedBindings.join(", ")}`,
              file: file.path,
            });
            handledCodes.add("TS2440");
            changed = true;
          }
        }

        if (duplicateIdentifierFiles.has(posix)) {
          const dup = fixDuplicateImportBindings(code, file.path);
          if (dup.fixed) {
            code = dup.code;
            fixes.push({
              fixer: "duplicate-import-binding-fixer",
              category: "mechanical",
              description: `Removed duplicate import binding(s) (TS2300): ${dup.removedBindings.join(", ")}`,
              file: file.path,
            });
            handledCodes.add("TS2300");
            changed = true;
          }
          const collision = fixDuplicateImportAndLocalTypeCollision(
            code,
            file.path,
          );
          if (collision.fixed) {
            code = collision.code;
            fixes.push(...collision.fixes);
            handledCodes.add("TS2300");
            changed = true;
          }
        }

        if (changed) {
          projectChanged = true;
          return { ...file, content: code };
        }
        return file;
      });

      if (projectChanged) {
        working = serializeCodeProject(fixedFiles);
      }
    }
  }

  return {
    content: working,
    fixed: working !== content,
    fixes,
    handledCodes: [...handledCodes],
  };
}
