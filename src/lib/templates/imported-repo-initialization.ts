import { updateChatOrchestrationSnapshot } from "@/lib/db/chat-repository/snapshot";
import {
  createGenerationTelemetryRecord,
  recordPreviewRuntimeOutcomeForVersion,
} from "@/lib/db/services/generation-telemetry";
import { sanitizeOrchestrationSnapshotForStorage } from "@/lib/gen/orchestration-snapshot";
import type { CodeFile } from "@/lib/gen/parser";
import type { ImportedRepoBaselineSnapshot, ImportedRepoOrigin } from "./imported-repo-contract";

export interface PersistImportedRepoInitializationInput {
  chatId: string;
  versionId: string;
  filesRevision?: string | null;
  model: string;
  buildIntent?: string | null;
  files: readonly CodeFile[];
  origin: ImportedRepoOrigin;
  baseline: ImportedRepoBaselineSnapshot;
}

export interface ImportedRepoInitializationPersistenceResult {
  snapshotPersisted: boolean;
  telemetryPersisted: boolean;
}

export type ImportedRepoPreviewOutcome = "failed" | "runtime-ready" | "pending";

export interface RecordImportedRepoPreviewOutcomeInput {
  versionId: string;
  filesRevision?: string | null;
  outcome: ImportedRepoPreviewOutcome;
}

function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function baselineTelemetryMeta(baseline: ImportedRepoBaselineSnapshot): Record<string, unknown> {
  const value = baseline as unknown as Record<string, unknown>;
  const contract =
    value.contract && typeof value.contract === "object" && !Array.isArray(value.contract)
      ? (value.contract as Record<string, unknown>)
      : value;
  const schemaVersion =
    typeof contract.schemaVersion === "number" ? contract.schemaVersion : undefined;
  const contractHash =
    typeof contract.contractHash === "string" ? contract.contractHash : undefined;

  return {
    importedRepoMode: true,
    llmUsed: false,
    stage: "init",
    ...(schemaVersion !== undefined ? { importedRepoContractVersion: schemaVersion } : {}),
    ...(contractHash ? { importedRepoContractHash: contractHash } : {}),
  };
}

/**
 * Persist the import baseline and the pending telemetry row before preview.
 *
 * Both writes are deliberately independent and fail-open: importing a complete
 * repository must not fail because observability or continuity metadata could
 * not be saved. The imported files themselves are never copied into telemetry.
 */
export async function persistImportedRepoInitialization(
  input: PersistImportedRepoInitializationInput,
): Promise<ImportedRepoInitializationPersistenceResult> {
  const result: ImportedRepoInitializationPersistenceResult = {
    snapshotPersisted: false,
    telemetryPersisted: false,
  };
  const filesRevision = nonEmpty(input.filesRevision);

  try {
    const snapshot = sanitizeOrchestrationSnapshotForStorage({
      importedRepoMode: true,
      projectOrigin: input.origin.kind,
      scaffoldId: null,
      lastVersionId: input.versionId,
      lastChatId: input.chatId,
      filesRevision,
      buildIntent: input.buildIntent ?? null,
      capturedAt: new Date().toISOString(),
      importedRepoBaseline: { ...input.baseline },
    });
    result.snapshotPersisted = await updateChatOrchestrationSnapshot(input.chatId, snapshot);
  } catch (error) {
    console.warn(
      "[imported-repo] Failed to persist initialization snapshot (non-blocking):",
      error,
    );
  }

  try {
    await createGenerationTelemetryRecord({
      chatId: input.chatId,
      versionId: input.versionId,
      scaffoldId: null,
      scaffoldSelectionMethod: "imported_repo",
      model: input.model,
      buildIntent: input.buildIntent ?? null,
      buildMethod: input.origin.kind === "v0_template" ? "template_import" : "repo_import",
      promptClassification: "imported_repo_init",
      previewSuccess: null,
      fileCount: input.files.length,
      meta: {
        projectOrigin: input.origin.kind,
        ...baselineTelemetryMeta(input.baseline),
      },
    });
    result.telemetryPersisted = true;
  } catch (error) {
    console.warn(
      "[imported-repo] Failed to persist initialization telemetry (non-blocking):",
      error,
    );
  }

  return result;
}

/**
 * Record only confirmed preview outcomes. A freshly queued runtime remains
 * pending (`preview_success = null`) until an actual runtime-ready receipt, and
 * all telemetry failures remain non-blocking for the import route.
 */
export async function recordImportedRepoPreviewOutcome(
  input: RecordImportedRepoPreviewOutcomeInput,
): Promise<boolean> {
  if (input.outcome === "pending") return false;

  try {
    const filesRevision = nonEmpty(input.filesRevision);
    await recordPreviewRuntimeOutcomeForVersion(
      input.versionId,
      input.outcome === "runtime-ready",
      input.outcome === "runtime-ready" && filesRevision
        ? { bootedFilesRevision: filesRevision }
        : undefined,
    );
    return true;
  } catch (error) {
    console.warn("[imported-repo] Failed to persist preview outcome (non-blocking):", error);
    return false;
  }
}
