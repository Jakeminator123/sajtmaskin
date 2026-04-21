/**
 * LLM-driven partial-file repair loop used when preflight detects that the
 * generator emitted truncated / excerpt-only files.
 *
 * Extracted from `src/lib/gen/stream/finalize-version.ts` 2026-04-21.
 */

import { runLlmFixer } from "@/lib/gen/autofix/llm-fixer";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { devLogAppend } from "@/lib/logging/devLog";
import { incPartialFileRepair } from "@/lib/observability/metrics";
import { readRecurringPatternsForChat } from "@/lib/logging/generation-log-writer";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import { type CanonicalModelId } from "@/lib/models/catalog";
import { PARTIAL_FILE_REPAIR_MAX_ATTEMPTS } from "@/lib/gen/defaults";
import type { BuildSpec } from "../../build-spec";
import {
  extractPartialFileNames,
  formatPartialIssuesAsFixerErrors,
} from "./partial-file";

const PARTIAL_FILE_REPAIR_TIMEOUT_MS = 60_000;

export async function tryRepairPartialFileOutput(params: {
  contentForVersion: string;
  chatId: string;
  resolvedTier?: CanonicalModelId;
  partialFileIssues: string[];
  previewPolicy?: BuildSpec["previewPolicy"];
}): Promise<{
  repairedContent: string | null;
  attempts: number;
  succeeded: boolean;
  partialFiles: string[];
}> {
  const { contentForVersion, chatId, resolvedTier, partialFileIssues, previewPolicy } = params;
  const partialFiles = extractPartialFileNames(partialFileIssues);
  if (partialFiles.length === 0) {
    return {
      repairedContent: null,
      attempts: 0,
      succeeded: false,
      partialFiles: [],
    };
  }

  const fixerModel = resolvedTier
    ? resolvePhaseModel(resolvedTier, "fixer").modelId
    : undefined;
  const fixerThinking = resolvedTier
    ? resolvePhaseThinking(resolvedTier, "fixer")
    : null;
  const errors = formatPartialIssuesAsFixerErrors(partialFiles, partialFileIssues);
  const maxAttempts = Math.max(1, PARTIAL_FILE_REPAIR_MAX_ATTEMPTS);
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), PARTIAL_FILE_REPAIR_TIMEOUT_MS);
    try {
      const result = await runLlmFixer(contentForVersion, errors, {
        model: fixerModel,
        thinking: fixerThinking?.thinking,
        reasoningEffort: fixerThinking?.reasoningEffort,
        requiredFiles: partialFiles,
        recurringPatterns: readRecurringPatternsForChat(chatId),
        abortSignal: abort.signal,
      });
      if (!result.success && !result.partial) {
        break;
      }
      // post-LLM mechanical pass on partial-file repair output. Required
      // because LLM fixer may emit imports/structure that need normalization
      // before parse/merge runs again.
      const reFixed = await runAutoFix(result.fixedContent, { previewPolicy });
      devLogAppend("in-progress", {
        type: "partial-file-repair.outcome",
        chatId,
        attempts,
        succeeded: true,
        partialFiles,
      });
      try {
        incPartialFileRepair("success");
      } catch {
        /* metrics fail-safe */
      }
      return {
        repairedContent: reFixed.fixedContent,
        attempts,
        succeeded: true,
        partialFiles,
      };
    } catch (err) {
      devLogAppend("in-progress", {
        type: "partial-file-repair.error",
        chatId,
        message: err instanceof Error ? err.message : "Unknown repair error",
        partialFiles,
        attempt,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  devLogAppend("in-progress", {
    type: "partial-file-repair.outcome",
    chatId,
    attempts,
    succeeded: false,
    partialFiles,
  });
  try {
    incPartialFileRepair("fail");
  } catch {
    /* metrics fail-safe */
  }
  return {
    repairedContent: null,
    attempts,
    succeeded: false,
    partialFiles,
  };
}
