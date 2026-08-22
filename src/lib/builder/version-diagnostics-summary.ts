import { readPreviewDiagnosticMeta } from "@/lib/gen/preview/diagnostics";

export type ErrorLogRow = {
  level: string;
  category?: string | null;
  message: string;
  meta?: unknown;
};

export function readLogPassId(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const value = (meta as Record<string, unknown>).logPassId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export type ErrorLogPassGroup<T extends ErrorLogRow> = {
  passId: string;
  logs: T[];
};

export type ErrorLogPassPartition<T extends ErrorLogRow> = {
  latestPassId: string | null;
  latestPassLogs: T[];
  historicalPasses: ErrorLogPassGroup<T>[];
  unscopedLogs: T[];
};

/**
 * The error-log route returns rows newest first. Preserve that stable order
 * while separating explicit passes from rows that have no pass identity. A
 * passless row is never guessed into a neighboring pass.
 */
export function partitionErrorLogsByPass<T extends ErrorLogRow>(
  logs: T[],
): ErrorLogPassPartition<T> {
  const passLogs = new Map<string, T[]>();
  const unscopedLogs: T[] = [];

  for (const log of logs) {
    const passId = readLogPassId(log.meta);
    if (passId === null) {
      unscopedLogs.push(log);
      continue;
    }
    const entries = passLogs.get(passId) ?? [];
    entries.push(log);
    passLogs.set(passId, entries);
  }

  const [latestPassId = null, ...historicalPassIds] = Array.from(passLogs.keys());
  return {
    latestPassId,
    latestPassLogs: latestPassId === null ? [] : (passLogs.get(latestPassId) ?? []),
    historicalPasses: historicalPassIds.map((passId) => ({
      passId,
      logs: passLogs.get(passId) ?? [],
    })),
    unscopedLogs,
  };
}

function isPasslessLifecycleLog(log: ErrorLogRow): boolean {
  const cat = typeof log.category === "string" ? log.category : "";
  return cat.startsWith("quality-gate:") ||
    cat === "preflight:quality-gate" ||
    cat === "preview" ||
    cat === "render-telemetry";
}

export function selectActiveErrorLogs<T extends ErrorLogRow>(
  logs: T[],
  latestPassId: string | null,
): T[] {
  if (latestPassId === null) return logs;

  const latestPassIndex = logs.findIndex((log) => readLogPassId(log.meta) === latestPassId);
  return logs.filter((log, index) => {
    if (readLogPassId(log.meta) === latestPassId) return true;
    if (readLogPassId(log.meta) !== null) return false;
    // Passless lifecycle rows are emitted after finalize (preview / server-verify).
    // Keep only rows newer than the latest pass marker; older passless rows belong
    // to historical attempts and should not keep the current diagnostics red.
    return latestPassIndex >= 0 && index < latestPassIndex && isPasslessLifecycleLog(log);
  });
}

export function buildErrorLogSummary(logs: ErrorLogRow[]) {
  const byLevel = { info: 0, warning: 0, error: 0 };
  const byCategory: Record<string, number> = {};

  for (const log of logs) {
    const level =
      log.level === "error" || log.level === "warning" || log.level === "info"
        ? log.level
        : "info";
    byLevel[level] += 1;
    const category = typeof log.category === "string" && log.category.trim()
      ? log.category.trim()
      : "uncategorized";
    byCategory[category] = (byCategory[category] ?? 0) + 1;
  }

  const { latestPassId } = partitionErrorLogsByPass(logs);
  const activeLogs = selectActiveErrorLogs(logs, latestPassId);
  const activeByLevel = { info: 0, warning: 0, error: 0 };
  for (const log of activeLogs) {
    const level =
      log.level === "error" || log.level === "warning" || log.level === "info"
        ? log.level
        : "info";
    activeByLevel[level] += 1;
  }

  const latestRender =
    activeLogs.find((log) => log.category === "render-telemetry" || log.category === "preview") ??
    null;
  const latestRenderMeta = readPreviewDiagnosticMeta(latestRender?.meta);

  return {
    total: logs.length,
    byLevel,
    byCategory,
    latestPassId,
    activeTotal: activeLogs.length,
    activeByLevel,
    latestPreflight:
      activeLogs.find((log) => typeof log.category === "string" && log.category.startsWith("preflight:")) ??
      null,
    latestQualityGate:
      activeLogs.find(
        (log) =>
          typeof log.category === "string" &&
          (log.category === "preflight:quality-gate" || log.category.startsWith("quality-gate:")),
      ) ?? null,
    latestRender,
    latestPreviewCode: latestRenderMeta.previewCode,
    latestPreviewStage: latestRenderMeta.previewStage,
  };
}
