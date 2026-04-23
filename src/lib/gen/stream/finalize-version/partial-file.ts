/**
 * Partial-file output detection + repair.
 *
 * When preflight flags a file as a partial repair snippet (common failure
 * mode on mid-tier follow-ups), we hand those file names back to the LLM
 * fixer with a concrete "emit the complete file" instruction, then run
 * the deterministic autofix again. Capped at
 * `PARTIAL_FILE_REPAIR_MAX_ATTEMPTS` attempts so a broken model can't
 * spin forever.
 *
 * Split out of `finalize-version.ts` (OMTAG-03 wave-rest) — no behavior
 * change.
 */

import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { runLlmFixer } from "@/lib/gen/autofix/llm-fixer";
import { PARTIAL_FILE_REPAIR_MAX_ATTEMPTS } from "@/lib/gen/defaults";
import { devLogAppend } from "@/lib/logging/devLog";
import { readRecurringPatternsForChat } from "@/lib/logging/generation-log-writer";
import { incPartialFileRepair } from "@/lib/observability/metrics";
import { DEFAULT_MODEL_ID, type CanonicalModelId } from "@/lib/models/catalog";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { FinalizePreflightIssue } from "../finalize-preflight";

export function isPartialFileOutputIssue(issue: FinalizePreflightIssue): boolean {
  const message = issue.message.toLowerCase();
  return (
    message.includes("partial repair snippet") ||
    message.includes("file excerpt instead of a complete file") ||
    message.includes("overlapping import statements") ||
    message.includes("nested import inside an unfinished import block")
  );
}

const PARTIAL_FILE_REPAIR_TIMEOUT_MS = 60_000;

function extractPartialFileNames(issues: string[]): string[] {
  const files: string[] = [];
  for (const issue of issues) {
    const colonIdx = issue.indexOf(":");
    if (colonIdx > 0) {
      const candidate = issue.slice(0, colonIdx).trim();
      if (candidate && /\.\w{2,4}$/.test(candidate)) files.push(candidate);
    }
  }
  return [...new Set(files)];
}

function formatPartialIssuesAsFixerErrors(
  partialFiles: string[],
  issues: string[],
): string[] {
  const errors = partialFiles.map(
    (f) =>
      `${f}:1:1 CRITICAL: This file contains only a partial snippet or excerpt. Output the COMPLETE file from the first import to the last line.`,
  );
  for (const issue of issues) {
    if (!errors.some((e) => issue.startsWith(e.split(":")[0]))) {
      errors.push(issue);
    }
  }
  return errors;
}

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

  // Bug 01#3-pattern (2026-04-22 follow-up audit): när resolvedTier saknas
  // blev fixerModel `undefined` och runLlmFixer föll på sin interna default —
  // phaseRouting.fixer var då inte längre garanterad. Samma fix som server-
  // verify.ts: default till `pro`-tier så reparation alltid speglar manifestet.
  const fixerTier = resolvedTier ?? DEFAULT_MODEL_ID;
  const fixerModel = resolvePhaseModel(fixerTier, "fixer").modelId;
  const fixerThinking = resolvePhaseThinking(fixerTier, "fixer");
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
      try { incPartialFileRepair("success"); } catch {}
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
  try { incPartialFileRepair("fail"); } catch {}
  return {
    repairedContent: null,
    attempts,
    succeeded: false,
    partialFiles,
  };
}
