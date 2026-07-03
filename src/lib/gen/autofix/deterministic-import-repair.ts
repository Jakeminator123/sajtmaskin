/**
 * Deterministic, diagnostic-driven import repair — runs BEFORE the LLM fixer
 * in BOTH import-repair entrypoints:
 *
 *   - finalize normalize: `validateAndFix()` (`autofix/validate-and-fix.ts`)
 *     when the warm-tsc pass fails, before `runLlmRepairGate`;
 *   - server repair: `runRepairLoop()` (`verify/repair-loop.ts`) on the
 *     quality-gate diagnostics, before the LLM passes.
 *
 * Why this exists (prod telemetry, 2026-06/07): 84% of typecheck failures are
 * import handling — TS2304 "Cannot find name" for KNOWN imports (Badge,
 * Button, Link, toast, …), TS2304 for the project's OWN components (Reveal),
 * and TS2300 "Duplicate identifier" from double react imports that the repair
 * paths themselves create. All are mechanically solvable; historically they
 * were only fixed AFTER the gate had already failed.
 *
 * The TypeScript diagnostics remove the ambiguity that makes the blind
 * heuristics in `runAutoFix()` miss these: they name the exact symbol + file.
 * This module consumes those diagnostics and dispatches each one to the
 * *existing* fixer with the exact target, so the LLM fixer only has to handle
 * the genuine residue. It deliberately reuses the canonical owners instead of
 * duplicating fix logic:
 *
 *   - `fixKnownTs2304Imports`               (TS2304 / TS2552, known libraries)
 *   - `fixMissingLocalSymbolImports`        (TS2304 residue: own project files)
 *   - `fixValueUsedFromTypeImport`          (TS1361, with confirmed symbols)
 *   - `fixImportedDeclarationConflicts`     (TS2440, path-aware self-import)
 *   - `consolidateReactImports`             (TS2300, overlapping react imports)
 *   - `fixDuplicateImportBindings`          (TS2300)
 *   - `fixDuplicateImportAndLocalTypeCollision` (TS2300 / TS2440 type collision)
 *
 * Mandatory post-injection dedupe (Fas 1 kontrollflöde): after every import
 * injection the touched file is re-checked — duplicate `react` imports are
 * consolidated, remaining duplicate bindings are removed, and if the file
 * STILL carries introduced duplicate bindings (or new parse errors) the
 * file's changes are reverted. No fixer here may leave behind two import
 * statements re-declaring the same local binding.
 *
 * Conservative by design: only import-only codes are touched. Logic/type
 * errors (TS2554, TS7006, TS7009, generic mismatch) are left for the LLM.
 * Every fixer here is idempotent, so a second run is a no-op.
 */

import { parseCodeProject, serializeCodeProject } from "@/lib/gen/parser";
import {
  classifyCannotFindNameResidual,
  fixKnownTs2304Imports,
  isKnownLibraryImportName,
  fileDeclaresSymbol,
  type CannotFindNameResidualReason,
} from "./rules/ts2304-known-import-fixer";
import { fixValueUsedFromTypeImport } from "./rules/value-used-from-type-import-fixer";
import {
  buildProjectExportIndex,
  buildProjectModuleExportIndex,
  fixImportedDeclarationConflicts,
  fixMissingLocalSymbolImports,
  insertImportAfterDirectives,
  isIndexableSharedFile,
  toAliasImportPath,
} from "./common-import-fixer";
import { fixDuplicateImportBindings } from "./rules/duplicate-import-binding-fixer";
import { fixDuplicateImportAndLocalTypeCollision } from "./rules/duplicate-import-local-type-collision-fixer";
import { consolidateReactImports } from "./rules/react-import-consolidated";
import {
  collectImportBindingRows,
  countParseErrors,
  createTsxSourceFile,
  findIntroducedDuplicateImportBindings,
  isGuardablePath,
} from "./rules/import-binding-ast";
import type { FixEntry } from "./types";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";

// TS2304 ("Cannot find name 'X'.") and TS2552 (the "...Did you mean 'Y'?"
// spelling-suggestion variant) are distinct tsc codes that the known-import
// fixer resolves the same way. The parsed diagnostic only carries the message
// (the leading `TSxxxx` code is stripped upstream), so the code is recovered
// from the message text; the capture group yields the missing name used to
// label telemetry per resolved import.
const CANNOT_FIND_NAME_RE = /Cannot find name '([^']+)'/;
// Match ONLY the TS2552 name-suggestion form: a quoted identifier immediately
// after "Did you mean". Other diagnostics that also begin with "Cannot find
// name 'X'." carry a "Did you mean" clause but are different codes — TS2662 /
// TS2663 ("...the static/instance member 'C.x'") and TS2311 ("...to write this
// in an async function") — so they must NOT be counted as TS2552; they fall
// through to the TS2304 default.
const TS2552_NAME_SUGGESTION_RE =
  /Cannot find name '[^']+'\.\s*Did you mean '[^']+'\?/;
const TS1361_RE =
  /'([^']+)' cannot be used as a value because it was imported using 'import type'/;
const DUPLICATE_IDENTIFIER_RE = /Duplicate identifier '[^']+'/;
const IMPORT_CONFLICT_RE =
  /Import declaration conflicts with local declaration of '[^']+'/;

/**
 * Minimal diagnostic shape this module consumes. Structurally compatible with
 * `ParsedRepairDiagnostic` (server repair-loop) and with mapped warm-tsc
 * `PreVmTypecheckDiagnostic`s (finalize normalize) — only file + message are
 * needed; the code is recovered from the message text.
 */
export interface DeterministicImportRepairDiagnostic {
  /** Project-relative file path the diagnostic points at. */
  file: string;
  /** Diagnostic message text (without the `error TSxxxx:` prefix). */
  message: string;
}

export interface DeterministicImportRepairResult {
  content: string;
  fixed: boolean;
  fixes: FixEntry[];
  /** Distinct TS codes a fixer actually resolved (for telemetry). */
  handledCodes: string[];
  /**
   * Telemetry summary for the cannot-find-name class (M#imp1 prod
   * archaeology). Reported on the existing `validate.tsc.import-repair` /
   * `verifier-pass.deterministic-import-fix` devLog events so a prod run
   * shows WHICH names resolved and WHY the residue stayed residual
   * (tier3_gated / ambiguous_shadcn_lucide / unknown_name / not_applied).
   */
  cannotFindSummary: {
    /** Distinct cannot-find codes seen in the input diagnostics. */
    seenCodes: string[];
    /** `file::name` keys the known-import/own-component fixers resolved. */
    resolvedNames: string[];
    residual: Array<{
      file: string;
      name: string;
      reason: CannotFindNameResidualReason;
    }>;
  };
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

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").trim();
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
 * Telemetry key for a cannot-find-name diagnostic. Keyed by *file + name* (not
 * name alone) because the known-import fixer resolves per file: the same symbol
 * can be a resolvable TS2552 in one file and a residual TS2304 in another, so a
 * name-only key would attribute the unresolved file's code to the resolved one.
 * `toPosixPath` matches the normalisation the fixer uses to map diagnostics to
 * files, so the diagnostic and the resulting addition land on the same key.
 */
function cannotFindNameKey(file: string, name: string): string {
  return `${toPosixPath(file)}::${name}`;
}

function nameAppearsInFile(code: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(code);
}

/** Local binding names introduced by import statements (AST-based). */
function collectImportedBindingNames(code: string, filePath: string): Set<string> {
  return new Set(
    collectImportBindingRows(createTsxSourceFile(filePath, code)).map((row) => row.name),
  );
}

/**
 * Own-component resolution (Fas 1 uppgift 4 — the "Reveal" class): a TS2304
 * name that is NOT in the known-library mapping is checked against the
 * version's own file list. When a matching own component/module file exists,
 * the import is added; when none exists, existing behaviour applies
 * (cross-file-checker/stub downstream) — normalize never creates new silent
 * stubs. No component registry — just the classification
 * known library vs own file vs unknown.
 */
function resolveOwnComponentImports(params: {
  code: string;
  filePath: string;
  missingNames: ReadonlySet<string>;
  exportIndex: Map<string, string[]>;
  defaultExportsByName: Map<string, string[]>;
}): { code: string; added: Array<{ name: string; module: string }> } {
  const added: Array<{ name: string; module: string }> = [];
  let working = params.code;

  // Named exports: reuse the canonical unique-candidate injector with an index
  // filtered to exactly the diagnostic-confirmed missing names. It keeps its
  // own guards (already imported, locally declared, usage present, exactly one
  // exporting file, never self).
  const filteredIndex = new Map<string, string[]>();
  for (const name of params.missingNames) {
    const candidates = params.exportIndex.get(name);
    if (candidates && candidates.length > 0) filteredIndex.set(name, candidates);
  }
  if (filteredIndex.size > 0) {
    const namedResult = fixMissingLocalSymbolImports(
      working,
      params.filePath,
      filteredIndex,
    );
    if (namedResult.fixed) {
      working = namedResult.code;
      for (const name of namedResult.addedSymbols) {
        const candidates = filteredIndex.get(name);
        added.push({ name, module: candidates?.[0] ?? "" });
      }
    }
  }

  // Default exports: `components/reveal.tsx` with `export default function
  // Reveal` is invisible to the named-export index. Resolve only when exactly
  // one own shared file default-exports the name.
  const selfModule = toAliasImportPath(params.filePath);
  const alreadyAdded = new Set(added.map((a) => a.name));
  for (const name of params.missingNames) {
    if (alreadyAdded.has(name)) continue;
    const candidates = (params.defaultExportsByName.get(name) ?? []).filter(
      (module) => module !== selfModule,
    );
    if (candidates.length !== 1) continue;
    if (!nameAppearsInFile(working, name)) continue;
    if (collectImportedBindingNames(working, params.filePath).has(name)) continue;
    if (fileDeclaresSymbol(working, name)) continue;
    working = insertImportAfterDirectives(
      working,
      `import ${name} from "${candidates[0]}";`,
    );
    added.push({ name, module: candidates[0] });
  }

  return { code: working, added };
}

/**
 * Mandatory post-injection dedupe + receipt (Fas 1 uppgift 2). Runs after any
 * fixer changed a file:
 *
 *   1. `consolidateReactImports` — merge overlapping `react` import statements
 *      (the "smörsajt" class: double React import → TS2300 → webpack crash).
 *   2. `fixDuplicateImportBindings` — remove any remaining duplicate binding
 *      the injections introduced (AST-based, any module).
 *   3. Receipt: if the file still carries *introduced* duplicate bindings, or
 *      the changes made a parseable file unparseable, revert the file to its
 *      original content — no fixer here may hand over two import statements
 *      re-declaring the same local binding.
 */
function dedupeAndValidateInjectedFile(params: {
  originalCode: string;
  code: string;
  filePath: string;
}): {
  code: string;
  reverted: boolean;
  consolidatedReactBindings: string[];
  removedDuplicateBindings: string[];
} {
  let working = params.code;
  const consolidatedReactBindings: string[] = [];
  const removedDuplicateBindings: string[] = [];

  const consolidation = consolidateReactImports(working);
  if (consolidation.deduped.length > 0) {
    working = consolidation.code;
    consolidatedReactBindings.push(...consolidation.deduped);
  }

  if (
    findIntroducedDuplicateImportBindings(
      params.originalCode,
      working,
      params.filePath,
    ).length > 0
  ) {
    const dedup = fixDuplicateImportBindings(working, params.filePath);
    if (dedup.fixed) {
      working = dedup.code;
      removedDuplicateBindings.push(...dedup.removedBindings);
    }
  }

  const introducedDuplicates = findIntroducedDuplicateImportBindings(
    params.originalCode,
    working,
    params.filePath,
  );
  const parseRegression =
    countParseErrors(working, params.filePath) >
    countParseErrors(params.originalCode, params.filePath);
  if (introducedDuplicates.length > 0 || parseRegression) {
    return {
      code: params.originalCode,
      reverted: true,
      consolidatedReactBindings: [],
      removedDuplicateBindings: [],
    };
  }

  return {
    code: working,
    reverted: false,
    consolidatedReactBindings,
    removedDuplicateBindings,
  };
}

/**
 * Apply deterministic import-only fixes for the diagnostics the gate produced.
 * Returns the original content unchanged when nothing resolvable is found.
 */
export function runDeterministicImportRepair(
  content: string,
  diagnostics: ReadonlyArray<DeterministicImportRepairDiagnostic>,
  options: DeterministicImportRepairOptions = {},
): DeterministicImportRepairResult {
  // F3 (integrations build) is the only stage allowed to (re)introduce tier-3
  // backend SDK imports. F2 / unknown → keep them residual (P1 contract guard).
  const allowTier3 = options.previewPolicy === "fidelity3";
  // Bucket diagnostics by the fixer they drive.
  const ts2304Diagnostics: DeterministicImportRepairDiagnostic[] = [];
  const cannotFindNamesByFile = new Map<string, Set<string>>();
  const ts1361SymbolsByFile = new Map<string, Set<string>>();
  const conflictFiles = new Set<string>();
  const duplicateIdentifierFiles = new Set<string>();
  // `file::name` → the distinct cannot-find-name code(s) the gate reported for
  // that symbol in that file (TS2304 and/or its TS2552 "did you mean" variant).
  // Both drive the same known-import fixer, but telemetry must record the
  // *actual* code, so each resolved import is labelled from here — per file, so
  // a residual same-named diagnostic in another file is not mis-counted —
  // instead of always as TS2304.
  const cannotFindNameCodes = new Map<string, Set<string>>();

  for (const diagnostic of diagnostics) {
    const file = toPosixPath(diagnostic.file);
    if (!file) continue;
    const cannotFindName = diagnostic.message.match(CANNOT_FIND_NAME_RE);
    if (cannotFindName) {
      ts2304Diagnostics.push(diagnostic);
      ensureSet(cannotFindNamesByFile, file).add(cannotFindName[1]);
      const code = TS2552_NAME_SUGGESTION_RE.test(diagnostic.message)
        ? "TS2552"
        : "TS2304";
      ensureSet(
        cannotFindNameCodes,
        cannotFindNameKey(diagnostic.file, cannotFindName[1]),
      ).add(code);
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
  // Cannot-find names the known-import fixer actually resolved (per file+name),
  // so the own-component step only sees the genuine residue.
  const resolvedCannotFindKeys = new Set<string>();
  // Step-1 fixes/codes are bucketed per file and only committed after the
  // per-file post-injection receipt below validated the file — a reverted file
  // must not leave stale fix entries or handled codes behind.
  const step1FixesByFile = new Map<string, FixEntry[]>();
  const step1CodesByFile = new Map<string, Set<string>>();

  // 1) TS2304 / TS2552 — whole-project, diagnostic-driven known-import fixer.
  if (ts2304Diagnostics.length > 0) {
    const result = fixKnownTs2304Imports(working, ts2304Diagnostics, { allowTier3 });
    if (result.addedImports.length > 0) {
      working = result.code;
      for (const fix of result.fixes) {
        const key = fix.file ? toPosixPath(fix.file) : "";
        const bucket = step1FixesByFile.get(key) ?? [];
        bucket.push({ ...fix, category: "mechanical" });
        step1FixesByFile.set(key, bucket);
      }
      // Record the actual code each resolved import was reported under (keyed
      // per file + symbol), so a TS2552 "did you mean" fix is counted as TS2552
      // rather than folded into TS2304. Falls back to TS2304 if a resolved name
      // was somehow never classified, preserving the invariant that a fix always
      // records a code.
      for (const addition of result.addedImports) {
        const key = cannotFindNameKey(addition.file, addition.name);
        resolvedCannotFindKeys.add(key);
        const codes = cannotFindNameCodes.get(key);
        const fileKey = toPosixPath(addition.file);
        const bucket = step1CodesByFile.get(fileKey) ?? new Set<string>();
        if (codes && codes.size > 0) {
          for (const code of codes) bucket.add(code);
        } else {
          bucket.add("TS2304");
        }
        step1CodesByFile.set(fileKey, bucket);
      }
    }
  }

  // 2) Per-file passes — own-component resolution for residual TS2304 names,
  //    the diagnostic-confirmed TS1361/TS2440/TS2300 fixers, and the mandatory
  //    post-injection dedupe/receipt for every file a fixer touched.
  const needsPerFilePass =
    cannotFindNamesByFile.size > 0 ||
    ts1361SymbolsByFile.size > 0 ||
    conflictFiles.size > 0 ||
    duplicateIdentifierFiles.size > 0;

  let committedChange = false;
  if (needsPerFilePass) {
    const project = parseCodeProject(working);
    if (project.files.length > 0) {
      const originalByPath = new Map(
        parseCodeProject(content).files.map((file) => [
          toPosixPath(file.path),
          file.content,
        ]),
      );

      // Own-component residue: cannot-find names the known fixer did not
      // resolve AND that are not known-library names at all (known-but-
      // suppressed names — tier-3 in F2, ambiguous shadcn∩lucide — stay with
      // the LLM). Indexes are built once, lazily, only when residue exists.
      const ownComponentResidualByFile = new Map<string, Set<string>>();
      for (const [file, names] of cannotFindNamesByFile) {
        for (const name of names) {
          if (resolvedCannotFindKeys.has(cannotFindNameKey(file, name))) continue;
          if (isKnownLibraryImportName(name)) continue;
          ensureSet(ownComponentResidualByFile, file).add(name);
        }
      }
      let exportIndex: Map<string, string[]> | null = null;
      let defaultExportsByName: Map<string, string[]> | null = null;
      if (ownComponentResidualByFile.size > 0) {
        exportIndex = buildProjectExportIndex(project.files);
        defaultExportsByName = new Map<string, string[]>();
        const moduleIndex = buildProjectModuleExportIndex(project.files);
        for (const [path, entry] of moduleIndex) {
          if (!entry.hasDefault || !entry.defaultName) continue;
          if (!isIndexableSharedFile(path)) continue;
          const modulePath = toAliasImportPath(path);
          const bucket = defaultExportsByName.get(entry.defaultName) ?? [];
          if (!bucket.includes(modulePath)) bucket.push(modulePath);
          defaultExportsByName.set(entry.defaultName, bucket);
        }
      }

      const fixedFiles = project.files.map((file) => {
        const posix = toPosixPath(file.path);
        const originalCode = originalByPath.get(posix) ?? file.content;
        let code = file.content;
        let changed = code !== originalCode;
        const fileFixes: FixEntry[] = [...(step1FixesByFile.get(posix) ?? [])];
        const fileHandledCodes = new Set<string>(step1CodesByFile.get(posix) ?? []);

        const ownComponentNames = ownComponentResidualByFile.get(posix);
        if (
          ownComponentNames &&
          ownComponentNames.size > 0 &&
          exportIndex &&
          defaultExportsByName &&
          /\.(tsx?|jsx?)$/.test(file.path)
        ) {
          const result = resolveOwnComponentImports({
            code,
            filePath: file.path,
            missingNames: ownComponentNames,
            exportIndex,
            defaultExportsByName,
          });
          if (result.added.length > 0) {
            code = result.code;
            fileFixes.push({
              fixer: "own-component-import-fixer",
              category: "mechanical",
              description: `Added own-project import(s) for ${result.added
                .map((addition) => `${addition.name} (${addition.module})`)
                .join(", ")}`,
              file: file.path,
            });
            for (const addition of result.added) {
              const key = cannotFindNameKey(posix, addition.name);
              resolvedCannotFindKeys.add(key);
              const codes = cannotFindNameCodes.get(key);
              if (codes && codes.size > 0) {
                for (const c of codes) fileHandledCodes.add(c);
              } else {
                fileHandledCodes.add("TS2304");
              }
            }
            changed = true;
          }
        }

        const forcedValueSymbols = ts1361SymbolsByFile.get(posix);
        if (forcedValueSymbols && forcedValueSymbols.size > 0) {
          const result = fixValueUsedFromTypeImport(
            code,
            file.path,
            forcedValueSymbols,
          );
          if (result.fixed) {
            code = result.code;
            fileFixes.push(...result.fixes);
            fileHandledCodes.add("TS1361");
            changed = true;
          }
        }

        if (conflictFiles.has(posix)) {
          const result = fixImportedDeclarationConflicts(code, file.path);
          if (result.fixed) {
            code = result.code;
            fileFixes.push({
              fixer: "import-declaration-conflict-fixer",
              category: "mechanical",
              description: `Dropped import(s) conflicting with local declaration (TS2440): ${result.removedBindings.join(", ")}`,
              file: file.path,
            });
            fileHandledCodes.add("TS2440");
            changed = true;
          }
        }

        if (duplicateIdentifierFiles.has(posix)) {
          // Consolidate overlapping `react` imports FIRST: the generic
          // duplicate-binding pruner keeps the first declaration, which for a
          // `import type { ReactNode }` + value `import { ReactNode }` pair
          // would keep the type-only binding and re-break the value usage
          // (TS1361). Consolidation is value-wins and merges the statements.
          const consolidation = consolidateReactImports(code);
          if (consolidation.deduped.length > 0) {
            code = consolidation.code;
            fileFixes.push({
              fixer: "react-hook-import-fixer",
              category: "mechanical",
              description: `Consolidated duplicate react imports (TS2300): ${consolidation.deduped.join(", ")}`,
              file: file.path,
            });
            fileHandledCodes.add("TS2300");
            changed = true;
          }
          const dup = fixDuplicateImportBindings(code, file.path);
          if (dup.fixed) {
            code = dup.code;
            fileFixes.push({
              fixer: "duplicate-import-binding-fixer",
              category: "mechanical",
              description: `Removed duplicate import binding(s) (TS2300): ${dup.removedBindings.join(", ")}`,
              file: file.path,
            });
            fileHandledCodes.add("TS2300");
            changed = true;
          }
          const collision = fixDuplicateImportAndLocalTypeCollision(
            code,
            file.path,
          );
          if (collision.fixed) {
            code = collision.code;
            fileFixes.push(...collision.fixes);
            fileHandledCodes.add("TS2300");
            changed = true;
          }
        }

        if (!changed) return file;

        // Mandatory post-injection dedupe + receipt for guardable code files.
        if (isGuardablePath(file.path)) {
          const receipt = dedupeAndValidateInjectedFile({
            originalCode,
            code,
            filePath: file.path,
          });
          if (receipt.reverted) {
            // The injections for this file corrupted it (introduced duplicate
            // bindings that could not be consolidated, or a parse regression).
            // Drop the file's fixes and keep the pre-repair content — the
            // diagnostics stay visible to the LLM fixer instead. (When no other
            // file commits a change, the whole result falls back to the
            // byte-identical original below.) The telemetry summary must not
            // count the file's names as resolved either.
            for (const key of [...resolvedCannotFindKeys]) {
              if (key.startsWith(`${posix}::`)) resolvedCannotFindKeys.delete(key);
            }
            return { ...file, content: originalCode };
          }
          code = receipt.code;
          if (receipt.consolidatedReactBindings.length > 0) {
            fileFixes.push({
              fixer: "react-hook-import-fixer",
              category: "mechanical",
              description: `Consolidated duplicate react imports after import injection (deduped: ${receipt.consolidatedReactBindings.join(", ")})`,
              file: file.path,
            });
          }
          if (receipt.removedDuplicateBindings.length > 0) {
            fileFixes.push({
              fixer: "duplicate-import-binding-fixer",
              category: "mechanical",
              description: `Removed duplicate import binding(s) introduced by import injection: ${receipt.removedDuplicateBindings.join(", ")}`,
              file: file.path,
            });
          }
        }

        fixes.push(...fileFixes);
        for (const c of fileHandledCodes) handledCodes.add(c);
        committedChange = true;
        return { ...file, content: code };
      });

      if (committedChange) {
        working = serializeCodeProject(fixedFiles);
      } else {
        // Nothing survived the per-file receipts (or nothing changed at all):
        // hand back the byte-identical original, never a serialize round-trip.
        working = content;
      }
    }
  }

  // Telemetry summary (M#imp1): which cannot-find codes were seen, which
  // names resolved, and per residual name WHY it stayed residual. Computed
  // against the ORIGINAL file contents (classification is read-only).
  const seenCodes = new Set<string>();
  for (const codes of cannotFindNameCodes.values()) {
    for (const code of codes) seenCodes.add(code);
  }
  const residual: DeterministicImportRepairResult["cannotFindSummary"]["residual"] = [];
  if (cannotFindNamesByFile.size > 0) {
    const codeByFile = new Map(
      parseCodeProject(content).files.map((file) => [
        toPosixPath(file.path),
        file.content,
      ]),
    );
    for (const [file, names] of cannotFindNamesByFile) {
      for (const name of names) {
        if (resolvedCannotFindKeys.has(cannotFindNameKey(file, name))) continue;
        residual.push({
          file,
          name,
          reason: classifyCannotFindNameResidual({
            name,
            filePath: file,
            fileCode: codeByFile.get(file),
            allowTier3,
          }),
        });
      }
    }
  }

  return {
    content: working,
    fixed: committedChange && working !== content,
    fixes,
    handledCodes: [...handledCodes],
    cannotFindSummary: {
      seenCodes: [...seenCodes],
      resolvedNames: [...resolvedCannotFindKeys],
      residual,
    },
  };
}
