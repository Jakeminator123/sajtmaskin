import { appendErrorLogEvent } from "@/lib/logging/error-log-rag";
import type { QualityGateCheckResult } from "../preview-quality-gate";
import type { ServerVerifyFailedOutput } from "../server-verify-log-meta";

/**
 * Best-effort TF-IDF error-log RAG producer coverage for the quality-gate
 * failures that trigger a server-side repair (real build/typecheck/lint
 * errors from `runQualityGateOnExportable` / the preview-VM build-error SSE)
 * — not just the LLM verifier's own findings (`verifier-phase.ts`). Logged as
 * `still-failing` at the moment the gate fails; the repair loop's OWN outcome
 * (`repair-loop.ts`) records whether the subsequent repair actually fixed it.
 * NEVER throws and never affects verification/repair control flow.
 */
export function logQualityGateFailuresBestEffort(params: {
  chatId: string;
  versionId: string;
  failedOutputs: ServerVerifyFailedOutput[];
  generationMode?: "init" | "followup" | "auto_repair" | null;
}): void {
  try {
    for (const failure of params.failedOutputs.slice(0, 5)) {
      appendErrorLogEvent({
        phase: "quality-gate",
        subphase: "server-verify",
        creator: "server-verify",
        severity: "error",
        fault: `quality-gate:${failure.check}`,
        faultText: failure.output ?? "",
        provider: "own-engine",
        result: "still-failing",
        chatId: params.chatId,
        versionId: params.versionId,
        generationMode: params.generationMode ?? null,
      });
    }
  } catch {
    // best-effort — must never affect the verify/repair path
  }
}

export function partitionServerVerifyFailures(results: QualityGateCheckResult[]): {
  failedOutputs: ServerVerifyFailedOutput[];
  nonRepairableFailures: QualityGateCheckResult[];
} {
  return {
    failedOutputs: results
      .filter((result) => !result.passed && result.repairable !== false)
      .map((result) => ({
        check: result.check,
        exitCode: result.exitCode,
        output: result.output,
        durationMs: result.durationMs ?? null,
      })),
    nonRepairableFailures: results.filter(
      (result) => !result.passed && result.repairable === false,
    ),
  };
}
