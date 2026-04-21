/**
 * Per-phase step telemetry types + builder for the finalize pipeline.
 *
 * Extracted from `src/lib/gen/stream/finalize-version.ts` 2026-04-21.
 */

import type { OwnEnginePostStreamPhaseId } from "../finalize-pipeline-contract";

export type FinalizeStepStatus = "done" | "skipped" | "error";

export type FinalizeStepTelemetry = {
  status: FinalizeStepStatus;
  durationMs: number;
  reason?: string;
} & Record<string, unknown>;

export type FinalizeStepTelemetryMap = Partial<
  Record<OwnEnginePostStreamPhaseId, FinalizeStepTelemetry>
>;

export function createFinalizeStepTelemetry(
  startedAtMs: number,
  status: FinalizeStepStatus,
  extra?: Record<string, unknown>,
): FinalizeStepTelemetry {
  return {
    status,
    durationMs: Math.max(0, Date.now() - startedAtMs),
    ...(extra ?? {}),
  };
}
