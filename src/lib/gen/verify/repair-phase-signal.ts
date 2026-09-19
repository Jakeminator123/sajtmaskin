/**
 * C3 — phase start/end signals for the repair loop's existing awaits.
 * Reuses `engine_version_error_logs` (no new telemetry product). A start
 * row is persisted BEFORE the await so an isolate kill still leaves
 * evidence of which step was in flight.
 */
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";

export const REPAIR_PHASE_LOG_CATEGORY = "server-repair:phase";

export type RepairPhaseName = "build_log" | "llm_pass" | "preview_verify";

export type RepairPhaseSignal = {
  chatId: string;
  versionId: string;
  phase: RepairPhaseName;
  event: "start" | "end";
  durationMs?: number;
  startedAt?: string;
  finishedAt?: string;
  passIndex?: number;
};

export async function recordRepairPhaseSignal(signal: RepairPhaseSignal): Promise<void> {
  await createEngineVersionErrorLogs([
    {
      chatId: signal.chatId,
      versionId: signal.versionId,
      level: "info",
      category: REPAIR_PHASE_LOG_CATEGORY,
      message:
        signal.event === "start"
          ? `Repair phase ${signal.phase} started.`
          : `Repair phase ${signal.phase} finished.`,
      meta: {
        phase: signal.phase,
        event: signal.event,
        durationMs: signal.durationMs ?? null,
        startedAt: signal.startedAt ?? null,
        finishedAt: signal.finishedAt ?? null,
        passIndex: signal.passIndex ?? null,
      },
    },
  ]).catch(() => []);
}

export async function withRepairPhaseSignal<T>(
  params: {
    chatId: string;
    versionId: string;
    phase: RepairPhaseName;
    passIndex?: number;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date().toISOString();
  await recordRepairPhaseSignal({
    ...params,
    event: "start",
    startedAt,
  });
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    await recordRepairPhaseSignal({
      ...params,
      event: "end",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    });
  }
}
