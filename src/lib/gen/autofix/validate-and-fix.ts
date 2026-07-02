import { RepairLedger, resolveLlmRepairConfig, runLlmRepairGate } from "./llm-repair-gate";
import { runAutoFix } from "./pipeline";
import { runDeterministicImportRepair } from "./deterministic-import-repair";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";
import type { CanonicalModelId } from "@/lib/models/catalog";
import { devLogAppend } from "@/lib/logging/devLog";
import { incEarlyStop, recordPhaseDuration } from "@/lib/observability/metrics";
import { SYNTAX_FIX_MAX_PASSES } from "../defaults";
import { normalizeErrorPattern, countByFixer, type FixEntry } from "./types";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { PreVmTypecheckSkipReason } from "@/lib/gen/preview/warm-typecheck";
import type { PreVmEslintSkipReason } from "@/lib/gen/preview/warm-eslint";

type ValidateFixStatus = "passed" | "partial" | "failed" | "pipeline-error";
type ValidateFixEarlyStopReason = "fixer_noop" | "no_improvement" | "time_budget_exceeded" | null;
const VALIDATOR_UNAVAILABLE_NEEDLE = "Syntax validator unavailable:";
const MAX_RESIDUAL_PATTERNS = 5;
const TSC_REPAIR_TIMEOUT_MS = 60_000;
const ESLINT_REPAIR_TIMEOUT_MS = 60_000;

export type TscPassOutcome =
  | {
      ran: false;
      skipped: PreVmTypecheckSkipReason | "esbuild_failed" | "quality_gate_planned";
      durationMs: number;
    }
  | {
      ran: true;
      diagnosticCount: number;
      repaired: boolean;
      durationMs: number;
    };

export type EslintPassOutcome =
  | {
      ran: false;
      skipped: PreVmEslintSkipReason | "esbuild_failed" | "tsc_failed";
      durationMs: number;
    }
  | {
      ran: true;
      errorCount: number;
      warningCount: number;
      repaired: boolean;
      durationMs: number;
    };

export interface ValidateFixResult {
  content: string;
  hadErrors: boolean;
  fixerUsed: boolean;
  fixerImproved: boolean;
  errorsBefore: number;
  errorsAfter: number;
  passes: number;
  status: ValidateFixStatus;
  pipelineError: string | null;
  earlyStopReason: ValidateFixEarlyStopReason;
  mechanicalFixCount: number;
  llmFixCount: number;
  residualPatterns: string[];
  /**
   * Outcome of the warm-tsc pass that runs after esbuild passes. Absent when
   * esbuild itself never reached `passed` (the tsc pass requires a clean
   * baseline to avoid running tsc on syntactically broken code).
   */
  tsc?: TscPassOutcome;
  /**
   * Outcome of the warm-eslint pass that runs after warm-tsc passes. Absent
   * when either esbuild or tsc failed — eslint needs TS-valid input to
   * avoid cascades of false-positive "undefined" errors. Feature-flag
   * gated via `SAJTMASKIN_BLOCKING_ESLINT`; when disabled, reported as
   * `{ ran: false, skipped: "feature_flag_disabled", ... }`.
   */
  eslint?: EslintPassOutcome;
}

export type ValidateFixProgressCallback = (event: {
  pass: number;
  phase:
    | "validating"
    | "fixing"
    | "retrying"
    | "passed"
    | "gave-up"
    | "tsc-validating"
    | "tsc-fixing"
    | "tsc-passed"
    | "tsc-skipped"
    | "eslint-validating"
    | "eslint-fixing"
    | "eslint-passed"
    | "eslint-skipped";
  errorCount: number;
}) => void;

export interface ValidateAndFixOptions {
  chatId: string;
  model: string;
  resolvedTier?: CanonicalModelId;
  onProgress?: ValidateFixProgressCallback;
  fixBudgetMs?: number;
  previewPolicy?: BuildSpecPreviewPolicy;
  alreadyMechanicallyFixed?: boolean;
  resolvedScaffold?: ScaffoldManifest | null;
  forceTsc?: boolean;
  skipWarmTsc?: boolean;
  forceEslint?: boolean;
  repairLedger?: RepairLedger;
  repairScopeId?: string;
}

function isBudgetExceeded(deadline: number): boolean {
  return Date.now() >= deadline;
}

function topPatterns(
  errors: Array<{ message: string }>,
  limit: number,
): string[] {
  const counts = new Map<string, number>();
  for (const e of errors) {
    const p = normalizeErrorPattern(e.message);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([pattern]) => pattern);
}

/**
 * Warm-tsc post-pass: runs `tsc --noEmit` against a per-scaffold warm
 * `node_modules` cache to catch type-only / module-resolution errors that
 * esbuild missed. When diagnostics fire, performs a single LLM fixer
 * round (with timeout + scoped model) followed by deterministic autofix —
 * mirroring the syntax-validation loop above.
 *
 * Previously this lived in its own finalize step (`pre_vm_typecheck`) and
 * carried its own LLM-fixer call with no model/abort signal. Consolidated
 * here so the budget, model resolution and progress contract is shared
 * with esbuild validation. Skips silently when the cache is cold or the
 * scaffold is missing — same fail-open contract as before.
 */
async function runWarmTscPass(
  contentForVersion: string,
  opts: {
    chatId: string;
    model: string;
    resolvedTier?: CanonicalModelId;
    previewPolicy?: BuildSpecPreviewPolicy;
    resolvedScaffold?: ScaffoldManifest | null;
    forceTsc?: boolean;
    onProgress?: ValidateFixProgressCallback;
    pass: number;
    budgetDeadline: number;
    repairLedger: RepairLedger;
    repairScopeId?: string;
  },
): Promise<{ content: string; tsc: TscPassOutcome; mechanicalFixesAdded: number; llmFixesAdded: number }> {
  const startedAt = Date.now();
  if (!opts.resolvedScaffold && !opts.forceTsc) {
    opts.onProgress?.({ pass: opts.pass, phase: "tsc-skipped", errorCount: 0 });
    return {
      content: contentForVersion,
      tsc: { ran: false, skipped: "no_files", durationMs: 0 },
      mechanicalFixesAdded: 0,
      llmFixesAdded: 0,
    };
  }
  if (isBudgetExceeded(opts.budgetDeadline)) {
    return {
      content: contentForVersion,
      tsc: { ran: false, skipped: "exception", durationMs: 0 },
      mechanicalFixesAdded: 0,
      llmFixesAdded: 0,
    };
  }
  try {
    const { runPreVmTypecheck, formatTypecheckDiagnosticsForRepair } = await import(
      "@/lib/gen/preview/warm-typecheck"
    );
    const { parseCodeProject } = await import("@/lib/gen/parser");
    const project = parseCodeProject(contentForVersion).files;
    opts.onProgress?.({ pass: opts.pass, phase: "tsc-validating", errorCount: 0 });
    const result = await runPreVmTypecheck({
      scaffoldId: opts.resolvedScaffold?.id ?? null,
      files: project,
      force: opts.forceTsc === true,
    });
    if (result.skipped) {
      opts.onProgress?.({ pass: opts.pass, phase: "tsc-skipped", errorCount: 0 });
      devLogAppend("in-progress", {
        type: "validate.tsc.skipped",
        chatId: opts.chatId,
        reason: result.skipped,
        scaffoldId: opts.resolvedScaffold?.id ?? null,
        pass: opts.pass,
      });
      // `cache_cold` only happens AFTER the feature flag / F3-force passed —
      // the operator asked for a blocking typecheck but the warm cache isn't
      // provisioned. Warn loudly so this never reads as "typecheck ran".
      if (result.skipped === "cache_cold") {
        console.warn(
          `[warm-typecheck] SAJTMASKIN_PRE_VM_TYPECHECK/F3-force is active but the warm cache is COLD for scaffold "${opts.resolvedScaffold?.id ?? "unknown"}" — the blocking typecheck was skipped (fail-open). Run \`npm run provision:warm-cache\` (see docs/howto/warm-cache-setup.md).`,
        );
      }
      return {
        content: contentForVersion,
        tsc: { ran: false, skipped: result.skipped, durationMs: result.durationMs },
        mechanicalFixesAdded: 0,
        llmFixesAdded: 0,
      };
    }
    if (result.ok) {
      opts.onProgress?.({ pass: opts.pass, phase: "tsc-passed", errorCount: 0 });
      return {
        content: contentForVersion,
        tsc: {
          ran: true,
          diagnosticCount: 0,
          repaired: false,
          durationMs: result.durationMs,
        },
        mechanicalFixesAdded: 0,
        llmFixesAdded: 0,
      };
    }

    devLogAppend("in-progress", {
      type: "validate.tsc.diagnostics",
      chatId: opts.chatId,
      diagnosticCount: result.diagnostics.length,
      sample: result.diagnostics.slice(0, 5),
    });
    opts.onProgress?.({
      pass: opts.pass,
      phase: "tsc-fixing",
      errorCount: result.diagnostics.length,
    });

    let mechanicalFixesAdded = 0;
    let llmFixesAdded = 0;
    let workingContent = contentForVersion;
    let residualDiagnostics = result.diagnostics;

    // Deterministic, diagnostic-driven import repair BEFORE the LLM (Fas 1
    // kontrollflöde). The dominant warm-tsc failures are import-only
    // (TS2304/TS2552 known imports, own components, TS2300 duplicate react
    // imports, TS1361, TS2440) and the tsc diagnostics name the exact
    // symbol + file — resolve them mechanically, re-run warm-tsc ONCE
    // (bounded: no loop, max one extra pass per call), and only hand the
    // genuine residue to `runLlmRepairGate`.
    //
    // Sync invariant (Bugbot #363): the LLM must never see repaired content
    // paired with pre-repair diagnostics. The deterministic result is kept
    // ONLY when the warm-tsc re-check actually ran and produced the matching
    // residual set (or passed outright). If the re-check is budget-blocked,
    // skipped, or throws, fall back to the original content + original
    // diagnostics — the fixes are idempotent and are re-applied at the next
    // gate entry (e.g. the server repair-loop pre-pass).
    try {
      const importRepair = runDeterministicImportRepair(
        contentForVersion,
        result.diagnostics.map((d) => ({ file: d.filePath, message: d.message })),
        { previewPolicy: opts.previewPolicy },
      );
      if (importRepair.fixed) {
        devLogAppend("in-progress", {
          type: "validate.tsc.import-repair",
          chatId: opts.chatId,
          handledCodes: importRepair.handledCodes,
          fixCount: importRepair.fixes.length,
          fixers: countByFixer(importRepair.fixes),
        });
        let residualConfirmed = false;
        if (!isBudgetExceeded(opts.budgetDeadline)) {
          const recheck = await runPreVmTypecheck({
            scaffoldId: opts.resolvedScaffold?.id ?? null,
            files: parseCodeProject(importRepair.content).files,
            force: opts.forceTsc === true,
          });
          if (!recheck.skipped && recheck.ok) {
            // Proof signal for prod analysis: warm-tsc passed after the
            // deterministic import repair — the LLM fixer was skipped.
            devLogAppend("in-progress", {
              type: "validate.tsc.import-repair.resolved",
              chatId: opts.chatId,
              handledCodes: importRepair.handledCodes,
              llmSkippedBecauseResolved: true,
            });
            opts.onProgress?.({ pass: opts.pass, phase: "tsc-passed", errorCount: 0 });
            return {
              content: importRepair.content,
              tsc: {
                ran: true,
                diagnosticCount: result.diagnostics.length,
                repaired: true,
                durationMs: Date.now() - startedAt,
              },
              mechanicalFixesAdded: mechanicalFixesAdded + importRepair.fixes.length,
              llmFixesAdded: 0,
            };
          }
          if (!recheck.skipped) {
            workingContent = importRepair.content;
            residualDiagnostics = recheck.diagnostics;
            mechanicalFixesAdded += importRepair.fixes.length;
            residualConfirmed = true;
          }
        }
        if (!residualConfirmed) {
          devLogAppend("in-progress", {
            type: "validate.tsc.import-repair.unverified",
            chatId: opts.chatId,
            handledCodes: importRepair.handledCodes,
            reason: "recheck_unavailable",
          });
        }
      }
    } catch (importRepairErr) {
      // Any failure inside the deterministic pass (including a throwing
      // re-check) leaves workingContent/residualDiagnostics at their original
      // values — content and diagnostics stay in sync for the LLM gate.
      devLogAppend("in-progress", {
        type: "validate.tsc.import-repair-error",
        chatId: opts.chatId,
        message:
          importRepairErr instanceof Error
            ? importRepairErr.message
            : String(importRepairErr),
      });
    }

    const remainingBudgetMs = Math.max(1_000, opts.budgetDeadline - Date.now());
    try {
      const errors = formatTypecheckDiagnosticsForRepair(residualDiagnostics);
      const repairGate = await runLlmRepairGate({
        content: workingContent,
        errors,
        chatId: opts.chatId,
        timeoutMs: Math.min(TSC_REPAIR_TIMEOUT_MS, remainingBudgetMs),
        resolvedTier: opts.resolvedTier,
        scopeId: opts.repairScopeId,
        phase: "warm-tsc",
        ledger: opts.repairLedger,
      });
      const repaired = repairGate.result;
      if (repaired.success && repaired.fixedContent) {
        llmFixesAdded += repaired.fixedFiles.length;
        const reFixed = await runAutoFix(repaired.fixedContent, {
          chatId: opts.chatId,
          model: opts.model,
          previewPolicy: opts.previewPolicy,
        });
        mechanicalFixesAdded += reFixed.fixes.length;
        return {
          content: reFixed.fixedContent,
          tsc: {
            ran: true,
            diagnosticCount: result.diagnostics.length,
            repaired: true,
            durationMs: Date.now() - startedAt,
          },
          mechanicalFixesAdded,
          llmFixesAdded,
        };
      }
    } catch (repairErr) {
      devLogAppend("in-progress", {
        type: "validate.tsc.repair-error",
        chatId: opts.chatId,
        message: repairErr instanceof Error ? repairErr.message : String(repairErr),
      });
    }

    // Keep the deterministic import fixes even when residue remains — they are
    // idempotent and strictly reduce the diagnostic set for the next gate.
    return {
      content: workingContent,
      tsc: {
        ran: true,
        diagnosticCount: result.diagnostics.length,
        repaired: false,
        durationMs: Date.now() - startedAt,
      },
      mechanicalFixesAdded,
      llmFixesAdded,
    };
  } catch (err) {
    devLogAppend("in-progress", {
      type: "validate.tsc.error",
      chatId: opts.chatId,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      content: contentForVersion,
      tsc: { ran: false, skipped: "exception", durationMs: Date.now() - startedAt },
      mechanicalFixesAdded: 0,
      llmFixesAdded: 0,
    };
  }
}

/**
 * Warm-eslint post-pass: runs `eslint . --max-warnings=<N>` against the
 * warm scaffold cache after warm-tsc passes. Feature-flag gated via
 * `SAJTMASKIN_BLOCKING_ESLINT`. When errors are found, runs a single
 * LLM fixer round (same model/budget contract as tsc pass) followed by
 * deterministic autofix. Fail-open on cache-cold / eslint-unavailable.
 *
 * Part of SAJ-28 / P34 Fas A+B. The fix closes the gap where eslint
 * errors (e.g. `react-hooks/set-state-in-effect`) previously only ran in
 * background verify-lane — too late to block the version from reaching
 * the user's download.
 */
async function runWarmEslintPass(
  contentForVersion: string,
  opts: {
    chatId: string;
    model: string;
    resolvedTier?: CanonicalModelId;
    previewPolicy?: BuildSpecPreviewPolicy;
    resolvedScaffold?: ScaffoldManifest | null;
    forceEslint?: boolean;
    onProgress?: ValidateFixProgressCallback;
    pass: number;
    budgetDeadline: number;
    repairLedger: RepairLedger;
    repairScopeId?: string;
  },
): Promise<{
  content: string;
  eslint: EslintPassOutcome;
  mechanicalFixesAdded: number;
  llmFixesAdded: number;
}> {
  const startedAt = Date.now();
  if (!opts.resolvedScaffold && !opts.forceEslint) {
    opts.onProgress?.({ pass: opts.pass, phase: "eslint-skipped", errorCount: 0 });
    return {
      content: contentForVersion,
      eslint: { ran: false, skipped: "no_files", durationMs: 0 },
      mechanicalFixesAdded: 0,
      llmFixesAdded: 0,
    };
  }
  if (isBudgetExceeded(opts.budgetDeadline)) {
    return {
      content: contentForVersion,
      eslint: { ran: false, skipped: "exception", durationMs: 0 },
      mechanicalFixesAdded: 0,
      llmFixesAdded: 0,
    };
  }
  try {
    const { runPreVmEslint, formatEslintIssuesForRepair } = await import(
      "@/lib/gen/preview/warm-eslint"
    );
    const { parseCodeProject } = await import("@/lib/gen/parser");
    const project = parseCodeProject(contentForVersion).files;
    opts.onProgress?.({ pass: opts.pass, phase: "eslint-validating", errorCount: 0 });
    const result = await runPreVmEslint({
      scaffoldId: opts.resolvedScaffold?.id ?? null,
      files: project,
      force: opts.forceEslint === true,
    });
    if (result.skipped) {
      opts.onProgress?.({ pass: opts.pass, phase: "eslint-skipped", errorCount: 0 });
      devLogAppend("in-progress", {
        type: "validate.eslint.skipped",
        chatId: opts.chatId,
        reason: result.skipped,
        scaffoldId: opts.resolvedScaffold?.id ?? null,
        pass: opts.pass,
      });
      // Same false-safety guard as warm-tsc: `cache_cold` means the blocking
      // eslint pass was requested (flag or F3-force) but couldn't run.
      if (result.skipped === "cache_cold") {
        console.warn(
          `[warm-eslint] SAJTMASKIN_BLOCKING_ESLINT/F3-force is active but the warm cache is COLD for scaffold "${opts.resolvedScaffold?.id ?? "unknown"}" — the blocking eslint pass was skipped (fail-open). Run \`npm run provision:warm-cache\` (see docs/howto/warm-cache-setup.md).`,
        );
      }
      return {
        content: contentForVersion,
        eslint: { ran: false, skipped: result.skipped, durationMs: result.durationMs },
        mechanicalFixesAdded: 0,
        llmFixesAdded: 0,
      };
    }
    const warningCount = result.issues.length - result.errorCount;
    if (result.ok) {
      opts.onProgress?.({ pass: opts.pass, phase: "eslint-passed", errorCount: 0 });
      devLogAppend("in-progress", {
        type: "validate.eslint.passed",
        chatId: opts.chatId,
        pass: opts.pass,
        warningCount,
        durationMs: result.durationMs,
      });
      return {
        content: contentForVersion,
        eslint: {
          ran: true,
          errorCount: 0,
          warningCount,
          repaired: false,
          durationMs: result.durationMs,
        },
        mechanicalFixesAdded: 0,
        llmFixesAdded: 0,
      };
    }

    devLogAppend("in-progress", {
      type: "validate.eslint.diagnostics",
      chatId: opts.chatId,
      errorCount: result.errorCount,
      warningCount,
      sample: formatEslintIssuesForRepair(result.issues).slice(0, 5),
    });
    opts.onProgress?.({
      pass: opts.pass,
      phase: "eslint-fixing",
      errorCount: result.errorCount,
    });

    const remainingBudgetMs = Math.max(1_000, opts.budgetDeadline - Date.now());
    let mechanicalFixesAdded = 0;
    let llmFixesAdded = 0;
    try {
      const errors = formatEslintIssuesForRepair(result.issues);
      const repairGate = await runLlmRepairGate({
        content: contentForVersion,
        errors,
        chatId: opts.chatId,
        timeoutMs: Math.min(ESLINT_REPAIR_TIMEOUT_MS, remainingBudgetMs),
        resolvedTier: opts.resolvedTier,
        scopeId: opts.repairScopeId,
        phase: "warm-eslint",
        ledger: opts.repairLedger,
      });
      const repaired = repairGate.result;
      if (repaired.success && repaired.fixedContent) {
        llmFixesAdded += repaired.fixedFiles.length;
        const reFixed = await runAutoFix(repaired.fixedContent, {
          chatId: opts.chatId,
          model: opts.model,
          previewPolicy: opts.previewPolicy,
        });
        mechanicalFixesAdded += reFixed.fixes.length;
        return {
          content: reFixed.fixedContent,
          eslint: {
            ran: true,
            errorCount: result.errorCount,
            warningCount,
            repaired: true,
            durationMs: Date.now() - startedAt,
          },
          mechanicalFixesAdded,
          llmFixesAdded,
        };
      }
    } catch (repairErr) {
      devLogAppend("in-progress", {
        type: "validate.eslint.repair-error",
        chatId: opts.chatId,
        message: repairErr instanceof Error ? repairErr.message : String(repairErr),
      });
    }

    return {
      content: contentForVersion,
      eslint: {
        ran: true,
        errorCount: result.errorCount,
        warningCount,
        repaired: false,
        durationMs: Date.now() - startedAt,
      },
      mechanicalFixesAdded,
      llmFixesAdded,
    };
  } catch (err) {
    devLogAppend("in-progress", {
      type: "validate.eslint.error",
      chatId: opts.chatId,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      content: contentForVersion,
      eslint: { ran: false, skipped: "exception", durationMs: Date.now() - startedAt },
      mechanicalFixesAdded: 0,
      llmFixesAdded: 0,
    };
  }
}

/**
 * Validates generated code via esbuild, and if syntax errors are found,
 * runs the mechanical → LLM → mechanical loop up to the configured pass
 * limit.  Returns the best available content together with structured
 * telemetry (mechanical vs LLM fix counts, residual error patterns).
 *
 * Wraps the inner implementation in a try/finally so phase duration is
 * recorded to Prometheus regardless of exit path (success / pipeline-error
 * / thrown). The metrics module is fail-safe; observation never throws.
 */
export async function validateAndFix(
  content: string,
  opts: ValidateAndFixOptions,
): Promise<ValidateFixResult> {
  const startedAt = Date.now();
  try {
    return await validateAndFixInner(content, opts);
  } finally {
    try {
      recordPhaseDuration("validate_syntax", Date.now() - startedAt);
    } catch {
      // Telemetry must never break codegen; swallow.
    }
  }
}

async function validateAndFixInner(
  content: string,
  opts: ValidateAndFixOptions,
): Promise<ValidateFixResult> {
  const onProgress = opts.onProgress;
  const fixBudgetMs = Math.max(1_000, opts.fixBudgetMs ?? 180_000);
  const budgetDeadline = Date.now() + fixBudgetMs;
  const repairLedger = opts.repairLedger ?? new RepairLedger();
  let totalMechanicalFixes = 0;
  let totalLlmFixes = 0;

  const emitBudgetStop = (pass: number, bestErrorCount: number) => {
    onProgress?.({ pass, phase: "gave-up", errorCount: bestErrorCount === Infinity ? 0 : bestErrorCount });
    devLogAppend("in-progress", {
      type: "syntax-validation.early-stop",
      chatId: opts.chatId,
      pass,
      reason: "time_budget_exceeded",
      fixBudgetMs,
    });
  };

  try {
    const { validateGeneratedCode } = await import("../retry/validate-syntax");

    // Initial mechanical pass — skipped when caller already ran runAutoFix
    // on this exact content (idempotent: guards against double work in the
    // finalize-version.ts pipeline where the outer autofix runs first).
    let currentContent = content;
    let initialMechanicalFixes: FixEntry[] = [];
    if (!opts.alreadyMechanicallyFixed) {
      const preFixResult = await runAutoFix(content, {
        chatId: opts.chatId,
        model: opts.model,
        previewPolicy: opts.previewPolicy,
      });
      currentContent = preFixResult.fixedContent;
      initialMechanicalFixes = preFixResult.fixes as FixEntry[];
      totalMechanicalFixes += preFixResult.fixes.length;
    }

    let initialErrorCount = 0;
    let bestContent = content;
    let bestErrorCount = Infinity;
    let fixerUsed = false;
    let fixerImproved = false;
    let passCount = 0;
    let earlyStopReason: ValidateFixEarlyStopReason = null;
    let lastErrors: Array<{ file: string; line: number; column: number; message: string }> = [];

    for (let pass = 1; pass <= SYNTAX_FIX_MAX_PASSES; pass++) {
      passCount = pass;

      if (isBudgetExceeded(budgetDeadline)) {
        earlyStopReason = "time_budget_exceeded";
        try { incEarlyStop("time_budget_exceeded", "validate_syntax"); } catch {}
        emitBudgetStop(pass, bestErrorCount);
        break;
      }

      // --- validate ---
      onProgress?.({ pass, phase: "validating", errorCount: 0 });
      devLogAppend("in-progress", {
        type: "syntax-validation.pass",
        chatId: opts.chatId,
        pass,
        phase: "validating",
      });

      const validation = await validateGeneratedCode(currentContent);

      const validatorUnavailableError = validation.errors.find((error: { message: string }) =>
        error.message.includes(VALIDATOR_UNAVAILABLE_NEEDLE),
      );
      if (validatorUnavailableError) {
        devLogAppend("in-progress", {
          type: "syntax-validation.pipeline-error",
          chatId: opts.chatId,
          message: validatorUnavailableError.message,
        });
        return {
          content: currentContent,
          hadErrors: true,
          fixerUsed: false,
          fixerImproved: false,
          errorsBefore: validation.errors.length,
          errorsAfter: validation.errors.length,
          passes: passCount,
          status: "pipeline-error",
          pipelineError: validatorUnavailableError.message,
          earlyStopReason: null,
          mechanicalFixCount: totalMechanicalFixes,
          llmFixCount: totalLlmFixes,
          residualPatterns: [],
        };
      }

      if (pass === 1) initialErrorCount = validation.errors.length;

      // --- clean? run warm-tsc post-pass and we're done ---
      if (validation.valid) {
        onProgress?.({ pass, phase: "passed", errorCount: 0 });
        devLogAppend("in-progress", {
          type: "syntax-validation.pass",
          chatId: opts.chatId,
          pass,
          phase: "passed",
          errorCount: 0,
        });
        const tscResult = opts.skipWarmTsc
          ? (() => {
              onProgress?.({ pass, phase: "tsc-skipped", errorCount: 0 });
              return {
                content: currentContent,
                tsc: {
                  ran: false as const,
                  skipped: "quality_gate_planned" as const,
                  durationMs: 0,
                },
                mechanicalFixesAdded: 0,
                llmFixesAdded: 0,
              };
            })()
          : await runWarmTscPass(currentContent, {
              chatId: opts.chatId,
              model: opts.model,
              resolvedTier: opts.resolvedTier,
              previewPolicy: opts.previewPolicy,
              resolvedScaffold: opts.resolvedScaffold,
              forceTsc: opts.forceTsc,
              onProgress,
              pass,
              budgetDeadline,
              repairLedger,
              repairScopeId: opts.repairScopeId,
            });
        currentContent = tscResult.content;
        totalMechanicalFixes += tscResult.mechanicalFixesAdded;
        totalLlmFixes += tscResult.llmFixesAdded;

        // Eslint pass runs only after TS is clean (ran && diagnosticCount===0
        // after repair, or ran with no diagnostics at all). TS-broken input
        // would produce a flood of no-undef / import-resolution cascades
        // that drown real lint errors.
        const tscClean =
          tscResult.tsc.ran &&
          (tscResult.tsc.diagnosticCount === 0 || tscResult.tsc.repaired);
        const eslintResult = tscClean
          ? await runWarmEslintPass(currentContent, {
              chatId: opts.chatId,
              model: opts.model,
              resolvedTier: opts.resolvedTier,
              previewPolicy: opts.previewPolicy,
              resolvedScaffold: opts.resolvedScaffold,
              forceEslint: opts.forceEslint,
              onProgress,
              pass,
              budgetDeadline,
              repairLedger,
              repairScopeId: opts.repairScopeId,
            })
          : null;
        if (eslintResult) {
          currentContent = eslintResult.content;
          totalMechanicalFixes += eslintResult.mechanicalFixesAdded;
          totalLlmFixes += eslintResult.llmFixesAdded;
        }

        return {
          content: currentContent,
          hadErrors: initialErrorCount > 0,
          fixerUsed:
            fixerUsed ||
            tscResult.llmFixesAdded > 0 ||
            (eslintResult?.llmFixesAdded ?? 0) > 0,
          fixerImproved:
            fixerImproved ||
            (tscResult.tsc.ran && tscResult.tsc.repaired) ||
            (eslintResult?.eslint.ran === true && eslintResult.eslint.repaired),
          errorsBefore: initialErrorCount,
          errorsAfter: 0,
          passes: passCount,
          status: "passed",
          pipelineError: null,
          earlyStopReason,
          mechanicalFixCount: totalMechanicalFixes,
          llmFixCount: totalLlmFixes,
          residualPatterns: [],
          tsc: tscResult.tsc,
          eslint: eslintResult?.eslint,
        };
      }

      // --- track best ---
      lastErrors = validation.errors;
      if (validation.errors.length < bestErrorCount) {
        bestErrorCount = validation.errors.length;
        bestContent = currentContent;
      }

      devLogAppend("in-progress", {
        type: "syntax-validation.pass",
        chatId: opts.chatId,
        pass,
        phase: "invalid",
        errorCount: validation.errors.length,
        errors: validation.errors.slice(0, 8).map((error: { file: string; line: number; message: string }) => ({
          file: error.file,
          line: error.line,
          message: error.message,
        })),
      });

      // --- residual telemetry: what mechanical fixers left behind ---
      if (pass === 1) {
        devLogAppend("in-progress", {
          type: "autofix.mechanical-residual",
          chatId: opts.chatId,
          mechanicalFixCount: initialMechanicalFixes.length,
          residualErrorCount: validation.errors.length,
          residualErrors: validation.errors.slice(0, 12).map((e: { file: string; line: number; message: string }) => ({
            file: e.file,
            line: e.line,
            message: e.message,
            pattern: normalizeErrorPattern(e.message),
          })),
          topMechanicalFixers: countByFixer(initialMechanicalFixes),
        });
      }

      // --- LLM fixer ---
      // Note: the "is this the last pass? give up" check used to live HERE,
      // before runLlmFixer was invoked. That made the LLM fixer dead code on
      // the final pass — and entirely unreachable when SYNTAX_FIX_MAX_PASSES
      // was 1. Moved AFTER the fixer block (search for "last pass with errors")
      // so the fixer always gets a chance on every pass within budget.
      const errorSummary = validation.errors.map(
        (e: { file: string; line: number; column: number; message: string }) =>
          `${e.file}:${e.line}:${e.column} ${e.message}`,
      );
      console.warn(`[engine] Pass ${pass}: ${validation.errors.length} syntax errors, attempting LLM fixer`);

      onProgress?.({ pass, phase: "fixing", errorCount: validation.errors.length });
      const syntaxRepairConfig = resolveLlmRepairConfig(opts.resolvedTier);
      const fixerModel = syntaxRepairConfig.fixerModel;
      devLogAppend("in-progress", {
        type: "syntax-validation.fixer.start",
        chatId: opts.chatId,
        pass,
        errorCount: validation.errors.length,
        errors: errorSummary.slice(0, 8),
        fixerModel: fixerModel ?? null,
      });

      try {
        const brokenFiles = [
          ...new Set(validation.errors.map((error: { file: string }) => error.file).filter(Boolean)),
        ];
        if (isBudgetExceeded(budgetDeadline)) {
          earlyStopReason = "time_budget_exceeded";
          try { incEarlyStop("time_budget_exceeded", "validate_syntax"); } catch {}
          emitBudgetStop(pass, bestErrorCount);
          break;
        }

        const remainingBudgetMs = budgetDeadline - Date.now();
        const repairGate = await runLlmRepairGate({
          content: currentContent,
          errors: errorSummary,
          chatId: opts.chatId,
          timeoutMs: remainingBudgetMs,
          requiredFiles: brokenFiles,
          config: syntaxRepairConfig,
          scopeId: opts.repairScopeId,
          phase: "syntax",
          ledger: repairLedger,
        });
        const fixerResult = repairGate.result;

        const canRetry = fixerResult.success || fixerResult.partial;
        if (!canRetry) {
          devLogAppend("in-progress", {
            type: "syntax-validation.fixer.noop",
            chatId: opts.chatId,
            pass,
            errorCount: validation.errors.length,
          });
          earlyStopReason = "fixer_noop";
          try { incEarlyStop("fixer_noop", "validate_syntax"); } catch {}
          onProgress?.({ pass, phase: "gave-up", errorCount: validation.errors.length });
          devLogAppend("in-progress", {
            type: "syntax-validation.early-stop",
            chatId: opts.chatId,
            pass,
            reason: earlyStopReason,
            errorCount: validation.errors.length,
          });
          break;
        }

        fixerUsed = true;
        totalLlmFixes += fixerResult.fixedFiles.length;

        if (fixerResult.partial) {
          devLogAppend("in-progress", {
            type: "syntax-validation.fixer.partial",
            chatId: opts.chatId,
            pass,
            missingFiles: fixerResult.missingFiles,
            fixedFiles: fixerResult.fixedFiles,
          });
        }

        // Mechanical pass on LLM output — required after each LLM fixer pass to
        // normalize freshly emitted imports/structure before the next validate pass.
        // Not deduped with the initial mechanical pass: content has changed.
        onProgress?.({ pass, phase: "retrying", errorCount: validation.errors.length });
        const reFixed = await runAutoFix(fixerResult.fixedContent, {
          chatId: opts.chatId,
          model: opts.model,
          previewPolicy: opts.previewPolicy,
        });
        currentContent = reFixed.fixedContent;
        totalMechanicalFixes += reFixed.fixes.length;

        if (isBudgetExceeded(budgetDeadline)) {
          earlyStopReason = "time_budget_exceeded";
          try { incEarlyStop("time_budget_exceeded", "validate_syntax"); } catch {}
          emitBudgetStop(pass, bestErrorCount);
          break;
        }

        const reValidation = await validateGeneratedCode(currentContent);
        if (reValidation.errors.length < bestErrorCount) {
          bestErrorCount = reValidation.errors.length;
          bestContent = currentContent;
          fixerImproved = true;
        }
        lastErrors = reValidation.errors;

        devLogAppend("in-progress", {
          type: "syntax-validation.fixer.result",
          chatId: opts.chatId,
          pass,
          errorsBefore: validation.errors.length,
          errorsAfter: reValidation.errors.length,
          improved: reValidation.errors.length < validation.errors.length,
          valid: reValidation.valid,
          fixerModel: fixerModel ?? null,
        });

        if (reValidation.valid) {
          console.info(`[engine] Pass ${pass}: LLM fixer resolved all errors`);
          onProgress?.({ pass, phase: "passed", errorCount: 0 });
          const tscResult = opts.skipWarmTsc
            ? (() => {
                onProgress?.({ pass, phase: "tsc-skipped", errorCount: 0 });
                return {
                  content: currentContent,
                  tsc: {
                    ran: false as const,
                    skipped: "quality_gate_planned" as const,
                    durationMs: 0,
                  },
                  mechanicalFixesAdded: 0,
                  llmFixesAdded: 0,
                };
              })()
            : await runWarmTscPass(currentContent, {
                chatId: opts.chatId,
                model: opts.model,
                resolvedTier: opts.resolvedTier,
                previewPolicy: opts.previewPolicy,
                resolvedScaffold: opts.resolvedScaffold,
                forceTsc: opts.forceTsc,
                onProgress,
                pass,
                budgetDeadline,
                repairLedger,
                repairScopeId: opts.repairScopeId,
              });
          currentContent = tscResult.content;
          totalMechanicalFixes += tscResult.mechanicalFixesAdded;
          totalLlmFixes += tscResult.llmFixesAdded;

          const tscClean =
            tscResult.tsc.ran &&
            (tscResult.tsc.diagnosticCount === 0 || tscResult.tsc.repaired);
          const eslintResult = tscClean
            ? await runWarmEslintPass(currentContent, {
                chatId: opts.chatId,
                model: opts.model,
                resolvedTier: opts.resolvedTier,
                previewPolicy: opts.previewPolicy,
                resolvedScaffold: opts.resolvedScaffold,
                forceEslint: opts.forceEslint,
                onProgress,
                pass,
                budgetDeadline,
                repairLedger,
                repairScopeId: opts.repairScopeId,
              })
            : null;
          if (eslintResult) {
            currentContent = eslintResult.content;
            totalMechanicalFixes += eslintResult.mechanicalFixesAdded;
            totalLlmFixes += eslintResult.llmFixesAdded;
          }

          return {
            content: currentContent,
            hadErrors: true,
            fixerUsed: true,
            fixerImproved: true,
            errorsBefore: initialErrorCount,
            errorsAfter: 0,
            passes: passCount,
            status: "passed",
            pipelineError: null,
            earlyStopReason,
            mechanicalFixCount: totalMechanicalFixes,
            llmFixCount: totalLlmFixes,
            residualPatterns: [],
            tsc: tscResult.tsc,
            eslint: eslintResult?.eslint,
          };
        }

        console.info(`[engine] Pass ${pass}: errors reduced ${validation.errors.length} -> ${reValidation.errors.length}`);
        if (reValidation.errors.length >= validation.errors.length) {
          if (pass < SYNTAX_FIX_MAX_PASSES) {
            if (reValidation.errors.length > validation.errors.length) {
              currentContent = bestContent;
            }
            devLogAppend("in-progress", {
              type: "syntax-validation.no-improvement.retrying",
              chatId: opts.chatId,
              pass,
              errorsBefore: validation.errors.length,
              errorsAfter: reValidation.errors.length,
            });
            continue;
          }
          earlyStopReason = "no_improvement";
          try { incEarlyStop("no_improvement", "validate_syntax"); } catch {}
          onProgress?.({ pass, phase: "gave-up", errorCount: reValidation.errors.length });
          devLogAppend("in-progress", {
            type: "syntax-validation.early-stop",
            chatId: opts.chatId,
            pass,
            reason: earlyStopReason,
            errorsBefore: validation.errors.length,
            errorsAfter: reValidation.errors.length,
          });
          break;
        }
      } catch (fixerError) {
        console.warn(`[engine] Pass ${pass}: LLM fixer failed`, fixerError);
        devLogAppend("in-progress", {
          type: "syntax-validation.fixer.error",
          chatId: opts.chatId,
          pass,
          errorCount: validation.errors.length,
          message: fixerError instanceof Error ? fixerError.message : "Unknown fixer error",
          fixerModel: fixerModel ?? null,
        });
        if (isBudgetExceeded(budgetDeadline)) {
          earlyStopReason = "time_budget_exceeded";
          try { incEarlyStop("time_budget_exceeded", "validate_syntax"); } catch {}
          emitBudgetStop(pass, bestErrorCount);
          break;
        }
      }

      // --- last pass with errors? give up ---
      // Runs AFTER the LLM fixer attempt so the fixer always gets a chance,
      // even on the final pass. (Earlier this lived before the fixer block,
      // making the fixer dead code on the final pass and unreachable when
      // SYNTAX_FIX_MAX_PASSES === 1.)
      if (pass === SYNTAX_FIX_MAX_PASSES) {
        const remaining =
          bestErrorCount === Infinity ? lastErrors.length : bestErrorCount;
        onProgress?.({ pass, phase: "gave-up", errorCount: remaining });
        devLogAppend("in-progress", {
          type: "syntax-validation.gave-up",
          chatId: opts.chatId,
          pass,
          errorCount: remaining,
        });
        break;
      }
    }

    return {
      content: bestContent,
      hadErrors: true,
      fixerUsed,
      fixerImproved,
      errorsBefore: initialErrorCount,
      errorsAfter: bestErrorCount === Infinity ? initialErrorCount : bestErrorCount,
      passes: passCount,
      status:
        bestErrorCount === Infinity || bestErrorCount >= initialErrorCount
          ? "failed"
          : "partial",
      pipelineError: null,
      earlyStopReason,
      mechanicalFixCount: totalMechanicalFixes,
      llmFixCount: totalLlmFixes,
      residualPatterns: topPatterns(lastErrors, MAX_RESIDUAL_PATTERNS),
    };
  } catch (err) {
    const pipelineErrorMessage =
      err instanceof Error ? err.message : "Unknown validation pipeline error";
    console.warn("[engine] Validation pipeline error, returning explicit failure state", err);
    devLogAppend("in-progress", {
      type: "syntax-validation.pipeline-error",
      chatId: opts.chatId,
      message: pipelineErrorMessage,
    });
    return {
      content,
      hadErrors: true,
      fixerUsed: false,
      fixerImproved: false,
      errorsBefore: 0,
      errorsAfter: 0,
      passes: 0,
      status: "pipeline-error",
      pipelineError: pipelineErrorMessage,
      earlyStopReason: null,
      mechanicalFixCount: totalMechanicalFixes,
      llmFixCount: totalLlmFixes,
      residualPatterns: [],
    };
  }
}
