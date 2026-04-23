/**
 * Helper for building `FinalizeStepTelemetry` entries with status +
 * duration + ad-hoc meta.
 *
 * Split out of `finalize-version.ts` (OMTAG-03 wave-rest) — no behavior
 * change.
 */

import type { FinalizeStepStatus, FinalizeStepTelemetry } from "./types";

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
