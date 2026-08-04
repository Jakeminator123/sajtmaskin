import { appendErrorLogEvent } from "@/lib/logging/error-log-rag";
import {
  FIX_LESSON_REPAIR_LOOP_DETERMINISTIC,
  repairLoopLlmFixLesson,
} from "@/lib/logging/error-log-fix-lessons";
import type { RepairFailedOutput } from "./diagnostics-parser";
import type { RepairEarlyStopReason, RepairMethod } from "./types";

/**
 * Best-effort TF-IDF error-log RAG producer coverage for `runRepairLoop`
 * outcomes. Widens the producer beyond the verifier-findings-only callsites
 * in `verifier-phase.ts` so real build/typecheck/lint quality-gate failures
 * (and whether the repair loop actually resolved them) also become RAG
 * training rows — this loop is shared by the server-verify background repair
 * AND the manual `/repair` route, so this single callsite covers both.
 * NEVER throws and never affects the loop's control flow or return value.
 */
export function logRepairLoopOutcomeBestEffort(params: {
  chatId?: string;
  failedOutputs: RepairFailedOutput[];
  method: RepairMethod;
  result: "fixed" | "still-failing";
  llmPasses: number;
  model?: string | null;
}): void {
  try {
    if (params.failedOutputs.length === 0) return;
    const fixText =
      params.result === "fixed"
        ? params.method === "deterministic"
          ? FIX_LESSON_REPAIR_LOOP_DETERMINISTIC
          : repairLoopLlmFixLesson(params.llmPasses)
        : null;
    for (const failure of params.failedOutputs.slice(0, 5)) {
      appendErrorLogEvent({
        phase: "server",
        subphase: `repair-loop:${params.method}`,
        creator: "repair-loop",
        fixer: params.result === "fixed" ? `repair-loop:${params.method}` : null,
        severity: params.result === "fixed" ? "warning" : "error",
        fault: `quality-gate:${failure.check}`,
        faultText: failure.output ?? "",
        fixText,
        model: params.model ?? null,
        provider: "own-engine",
        result: params.result,
        chatId: params.chatId ?? null,
      });
    }
  } catch {
    // best-effort — must never affect the repair loop's control flow
  }
}

export function resolveNonPromotedEarlyStopReason(params: {
  earlyStopReason: RepairEarlyStopReason;
  hasDeterministicProgress: boolean;
  improvedSyntax: boolean;
}): RepairEarlyStopReason {
  if (params.earlyStopReason) return params.earlyStopReason;
  // Deterministic pre-pass or syntax improvement counts as measurable
  // progress — leave reason null so callers classify gate-only failure as
  // `syntax_clean_gate_failed`, not spurious `no_improvement`.
  if (params.hasDeterministicProgress || params.improvedSyntax) return null;
  return "no_improvement";
}
