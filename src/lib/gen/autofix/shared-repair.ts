/**
 * Shared repair helper — wraps the existing `runLlmFixer` + `runAutoFix`
 * cycle with a unified budget that covers syntax, preview, and quality-gate
 * diagnostics.
 *
 * Callers provide diagnostics in the normalized RepairDiagnostic format;
 * this helper converts them to the string[] that `runLlmFixer` expects,
 * then re-runs machine autofix after each LLM pass.
 */

import { runLlmFixer } from "./llm-fixer";
import { runAutoFix } from "./pipeline";
import {
  formatDiagnosticsForFixer,
  type RepairDiagnostic,
} from "./repair-diagnostics";
import { resolvePhaseModel } from "@/lib/models/phase-routing";
import type { CanonicalModelId } from "@/lib/models/catalog";
import { devLogAppend } from "@/lib/logging/devLog";

const DEFAULT_BROAD_REPAIR_MAX_PASSES = 2;

export interface SharedRepairOpts {
  chatId: string;
  model: string;
  resolvedTier?: CanonicalModelId;
  maxPasses?: number;
  onProgress?: (event: { pass: number; phase: string; errorCount: number }) => void;
}

export interface SharedRepairResult {
  content: string;
  fixerUsed: boolean;
  fixerImproved: boolean;
  diagnosticsBefore: number;
  diagnosticsAfter: number;
  passes: number;
}

/**
 * Run machine autofix then (if diagnostics remain) up to `maxPasses` LLM
 * fixer rounds. Each LLM round re-runs machine autofix before re-checking.
 *
 * The `validate` callback lets callers supply any check — esbuild, preview
 * parse, or even a lightweight TS check — without coupling this helper to
 * a specific validator.
 */
export async function runSharedRepair(
  content: string,
  initialDiagnostics: RepairDiagnostic[],
  validate: (content: string) => Promise<RepairDiagnostic[]>,
  opts: SharedRepairOpts,
): Promise<SharedRepairResult> {
  const maxPasses = opts.maxPasses ?? DEFAULT_BROAD_REPAIR_MAX_PASSES;
  let currentContent = content;
  let currentDiags = initialDiagnostics;
  let fixerUsed = false;
  let fixerImproved = false;
  let bestContent = content;
  let bestDiagCount = currentDiags.length;
  let passCount = 0;

  // Machine autofix first (always)
  try {
    const machineResult = await runAutoFix(currentContent, {
      chatId: opts.chatId,
      model: opts.model,
    });
    currentContent = machineResult.fixedContent;
    currentDiags = await validate(currentContent);
    if (currentDiags.length < bestDiagCount) {
      bestDiagCount = currentDiags.length;
      bestContent = currentContent;
    }
  } catch {
    // Machine autofix failed; continue with original content
  }

  if (currentDiags.length === 0) {
    return {
      content: currentContent,
      fixerUsed: false,
      fixerImproved: false,
      diagnosticsBefore: initialDiagnostics.length,
      diagnosticsAfter: 0,
      passes: 0,
    };
  }

  for (let pass = 1; pass <= maxPasses && currentDiags.length > 0; pass++) {
    passCount = pass;
    opts.onProgress?.({ pass, phase: "fixing", errorCount: currentDiags.length });

    devLogAppend("in-progress", {
      type: "shared-repair.pass",
      chatId: opts.chatId,
      pass,
      diagnosticCount: currentDiags.length,
      diagnostics: formatDiagnosticsForFixer(currentDiags).slice(0, 8),
    });

    try {
      const fixerModel = opts.resolvedTier
        ? resolvePhaseModel(opts.resolvedTier, "fixer").modelId
        : undefined;
      const errors = formatDiagnosticsForFixer(currentDiags);
      const fixerResult = await runLlmFixer(currentContent, errors, {
        model: fixerModel,
      });

      if (!fixerResult.success) {
        devLogAppend("in-progress", {
          type: "shared-repair.fixer-noop",
          chatId: opts.chatId,
          pass,
        });
        break;
      }

      fixerUsed = true;

      const reFixed = await runAutoFix(fixerResult.fixedContent, {
        chatId: opts.chatId,
        model: opts.model,
      });
      currentContent = reFixed.fixedContent;
      currentDiags = await validate(currentContent);

      devLogAppend("in-progress", {
        type: "shared-repair.pass-result",
        chatId: opts.chatId,
        pass,
        diagsBefore: bestDiagCount,
        diagsAfter: currentDiags.length,
      });

      if (currentDiags.length < bestDiagCount) {
        bestDiagCount = currentDiags.length;
        bestContent = currentContent;
        fixerImproved = true;
      }

      if (currentDiags.length === 0) {
        opts.onProgress?.({ pass, phase: "passed", errorCount: 0 });
        return {
          content: currentContent,
          fixerUsed: true,
          fixerImproved: true,
          diagnosticsBefore: initialDiagnostics.length,
          diagnosticsAfter: 0,
          passes: passCount,
        };
      }
    } catch (err) {
      devLogAppend("in-progress", {
        type: "shared-repair.fixer-error",
        chatId: opts.chatId,
        pass,
        message: err instanceof Error ? err.message : "Unknown",
      });
      break;
    }
  }

  opts.onProgress?.({ pass: passCount, phase: "gave-up", errorCount: bestDiagCount });

  return {
    content: bestContent,
    fixerUsed,
    fixerImproved,
    diagnosticsBefore: initialDiagnostics.length,
    diagnosticsAfter: bestDiagCount,
    passes: passCount,
  };
}
