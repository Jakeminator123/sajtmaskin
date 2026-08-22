import { sanitizeOrchestrationSnapshotForStorage } from "./orchestration-snapshot";

type TelemetryReader = (versionId: string) => Promise<unknown[]>;

const readTelemetryFromDatabase: TelemetryReader = async (versionId) => {
  const { getTelemetryForVersion } = await import("@/lib/db/services/generation-telemetry");
  return getTelemetryForVersion(versionId);
};

type TelemetryRow = {
  meta?: unknown;
  scaffoldId?: unknown;
  variantId?: unknown;
  buildIntent?: unknown;
};

export type VersionBoundOrchestrationSource =
  "chat-snapshot" | "version-telemetry" | "version-minimal";

export interface VersionBoundOrchestration {
  snapshot: Record<string, unknown>;
  scaffoldId: string | null;
  source: VersionBoundOrchestrationSource;
  baseVersionId: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * A later finalize/repair can persist `{ lastVersionId, capturedAt }` (or just
 * `baseVersionId`) as `orchestrationSnapshot`. That object is truthy but must
 * not shadow the generation row that actually owns Brief/Variant/design.
 */
function isAuthoritativeOrchestrationSnapshot(
  snapshot: Record<string, unknown> | null,
): boolean {
  if (!snapshot) return false;
  return Boolean(
    record(snapshot.resolvedDesign) ||
      record(snapshot.briefSummary) ||
      record(snapshot.brief) ||
      record(snapshot.variantSelection) ||
      nonEmptyString(snapshot.variantId),
  );
}

/**
 * Quality-gate/repair passes append telemetry rows that intentionally contain
 * only their own verdict metadata. They must not shadow the newest row that
 * actually owns the version's orchestration authority.
 */
function selectOrchestrationTelemetryRow(rows: unknown[]): TelemetryRow | null {
  const telemetryRows = rows.map(record).filter((row): row is Record<string, unknown> => !!row);
  const snapshotRows = telemetryRows.filter((row) =>
    Boolean(record(record(row.meta)?.orchestrationSnapshot)),
  );
  const authoritative = snapshotRows.find((row) =>
    isAuthoritativeOrchestrationSnapshot(record(record(row.meta)?.orchestrationSnapshot)),
  );
  return (authoritative ?? snapshotRows[0] ?? telemetryRows[0] ?? null) as TelemetryRow | null;
}

/**
 * Recover the orchestration authority stored with one exact version. New rows
 * carry a complete sanitized snapshot; older rows still recover the canonical
 * fields that predated that envelope.
 */
export function buildVersionOrchestrationFromTelemetry(
  versionId: string,
  row: TelemetryRow | null | undefined,
): VersionBoundOrchestration {
  const telemetryMeta = record(row?.meta);
  const storedSnapshot = record(telemetryMeta?.orchestrationSnapshot);
  const scaffoldId =
    nonEmptyString(storedSnapshot?.scaffoldId) ??
    nonEmptyString(row?.scaffoldId) ??
    nonEmptyString(record(telemetryMeta?.buildSpec)?.scaffoldId);

  if (storedSnapshot) {
    const snapshot = sanitizeOrchestrationSnapshotForStorage({
      ...storedSnapshot,
      lastVersionId: versionId,
      scaffoldId,
    });
    return {
      snapshot,
      scaffoldId,
      source: "version-telemetry",
      baseVersionId: versionId,
    };
  }

  if (telemetryMeta || row) {
    const snapshot = sanitizeOrchestrationSnapshotForStorage({
      ...(telemetryMeta ?? {}),
      lastVersionId: versionId,
      scaffoldId,
      variantId: nonEmptyString(telemetryMeta?.variantId) ?? nonEmptyString(row?.variantId),
      buildIntent: nonEmptyString(telemetryMeta?.buildIntent) ?? nonEmptyString(row?.buildIntent),
    });
    return {
      snapshot,
      scaffoldId,
      source: "version-telemetry",
      baseVersionId: versionId,
    };
  }

  return {
    snapshot: { lastVersionId: versionId, scaffoldId: null },
    scaffoldId: null,
    source: "version-minimal",
    baseVersionId: versionId,
  };
}

/**
 * Bind follow-up orchestration to the exact selected base version. The global
 * chat snapshot is safe only when its identity agrees with the selected base
 * (or the client and server are both operating on the current version). An
 * explicit historical edit must never borrow the newest Brief/design state.
 */
export async function resolveVersionBoundOrchestration(params: {
  requestedBaseVersionId: string | null | undefined;
  latestKnownVersionId: string | null | undefined;
  explicitBaseRequested?: boolean;
  chatSnapshot: Record<string, unknown> | null | undefined;
  chatScaffoldId: string | null | undefined;
  readTelemetry?: TelemetryReader;
}): Promise<VersionBoundOrchestration> {
  const requestedBaseVersionId = nonEmptyString(params.requestedBaseVersionId);
  const latestKnownVersionId = nonEmptyString(params.latestKnownVersionId);
  const chatSnapshot = record(params.chatSnapshot) ?? {};
  const snapshotVersionId = nonEmptyString(chatSnapshot.lastVersionId);
  const chatScaffoldId = nonEmptyString(params.chatScaffoldId);

  if (
    !requestedBaseVersionId ||
    snapshotVersionId === requestedBaseVersionId ||
    (!snapshotVersionId &&
      (!params.explicitBaseRequested || latestKnownVersionId === requestedBaseVersionId))
  ) {
    return {
      snapshot: chatSnapshot,
      scaffoldId: nonEmptyString(chatSnapshot.scaffoldId) ?? chatScaffoldId,
      source: "chat-snapshot",
      baseVersionId: requestedBaseVersionId,
    };
  }

  try {
    const rows = await (params.readTelemetry ?? readTelemetryFromDatabase)(requestedBaseVersionId);
    return buildVersionOrchestrationFromTelemetry(
      requestedBaseVersionId,
      selectOrchestrationTelemetryRow(rows),
    );
  } catch {
    // The safe degradation for a historical edit is a minimal contract. Using
    // the newest chat-global design would be a silent cross-version mutation.
    return buildVersionOrchestrationFromTelemetry(requestedBaseVersionId, null);
  }
}

/** Read the per-version orchestration envelope used by post-generation checks. */
export async function readGenerationOrchestration(
  versionId: string,
  readTelemetry: TelemetryReader = readTelemetryFromDatabase,
): Promise<VersionBoundOrchestration | null> {
  const normalizedVersionId = nonEmptyString(versionId);
  if (!normalizedVersionId) return null;
  try {
    const rows = await readTelemetry(normalizedVersionId);
    const row = selectOrchestrationTelemetryRow(rows);
    if (!row) return null;
    return buildVersionOrchestrationFromTelemetry(normalizedVersionId, row);
  } catch {
    // Review remains available without a historical comparison.
  }
  return null;
}

/** Read the exact parent version recorded for a generated version. */
export async function readGenerationBaseVersionId(
  versionId: string,
  readTelemetry: TelemetryReader = readTelemetryFromDatabase,
): Promise<string | null> {
  const orchestration = await readGenerationOrchestration(versionId, readTelemetry);
  return nonEmptyString(orchestration?.snapshot.baseVersionId);
}
