import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportedRepoBaselineSnapshot } from "./imported-repo-contract";

const updateChatOrchestrationSnapshot = vi.hoisted(() => vi.fn());
const createGenerationTelemetryRecord = vi.hoisted(() => vi.fn());
const recordPreviewRuntimeOutcomeForVersion = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/chat-repository/snapshot", () => ({
  updateChatOrchestrationSnapshot,
}));
vi.mock("@/lib/db/services/generation-telemetry", () => ({
  createGenerationTelemetryRecord,
  recordPreviewRuntimeOutcomeForVersion,
}));

import {
  persistImportedRepoInitialization,
  recordImportedRepoPreviewOutcome,
} from "./imported-repo-initialization";

const baseline = {
  schemaVersion: 1,
  capturedAt: "2026-08-12T10:00:00.000Z",
  versionId: "version_1",
  filesRevision: "revision_1",
  contract: {
    schemaVersion: 1,
    contractHash: "sha256:contract",
    origin: { kind: "v0_template", templateId: "template_1" },
  },
  secretToken: "must-not-be-persisted",
} as unknown as ImportedRepoBaselineSnapshot;

function initializationInput() {
  return {
    chatId: "chat_1",
    versionId: "version_1",
    filesRevision: " revision_1 ",
    model: "import-no-llm",
    buildIntent: "app",
    files: [
      { path: "package.json", content: "{}", language: "json" },
      {
        path: "app/page.tsx",
        content: "export default function Page() {}",
        language: "tsx",
      },
    ],
    origin: { kind: "v0_template" as const, templateId: "template_1" },
    baseline,
  };
}

describe("persistImportedRepoInitialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateChatOrchestrationSnapshot.mockResolvedValue(true);
    createGenerationTelemetryRecord.mockResolvedValue({ id: "telemetry_1" });
  });

  it("persists a sanitized baseline snapshot and honest pending telemetry", async () => {
    const result = await persistImportedRepoInitialization(initializationInput());

    expect(result).toEqual({ snapshotPersisted: true, telemetryPersisted: true });
    expect(updateChatOrchestrationSnapshot).toHaveBeenCalledTimes(1);
    const [chatId, snapshot] = updateChatOrchestrationSnapshot.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(chatId).toBe("chat_1");
    expect(snapshot).toMatchObject({
      importedRepoMode: true,
      projectOrigin: "v0_template",
      scaffoldId: null,
      lastVersionId: "version_1",
      filesRevision: "revision_1",
      importedRepoBaseline: {
        schemaVersion: 1,
        contract: {
          schemaVersion: 1,
          contractHash: "sha256:contract",
        },
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain("app/page.tsx");
    expect(JSON.stringify(snapshot)).not.toContain("must-not-be-persisted");

    expect(createGenerationTelemetryRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_1",
        versionId: "version_1",
        scaffoldId: null,
        scaffoldSelectionMethod: "imported_repo",
        buildMethod: "template_import",
        previewSuccess: null,
        fileCount: 2,
        meta: expect.objectContaining({
          importedRepoMode: true,
          projectOrigin: "v0_template",
          importedRepoContractVersion: 1,
          importedRepoContractHash: "sha256:contract",
          llmUsed: false,
        }),
      }),
    );
  });

  it("keeps telemetry independent when the snapshot write fails", async () => {
    updateChatOrchestrationSnapshot.mockRejectedValueOnce(new Error("snapshot unavailable"));

    await expect(persistImportedRepoInitialization(initializationInput())).resolves.toEqual({
      snapshotPersisted: false,
      telemetryPersisted: true,
    });
    expect(createGenerationTelemetryRecord).toHaveBeenCalledTimes(1);
  });

  it("keeps the import and snapshot independent when telemetry fails", async () => {
    createGenerationTelemetryRecord.mockRejectedValueOnce(new Error("telemetry unavailable"));

    await expect(persistImportedRepoInitialization(initializationInput())).resolves.toEqual({
      snapshotPersisted: true,
      telemetryPersisted: false,
    });
    expect(updateChatOrchestrationSnapshot).toHaveBeenCalledTimes(1);
  });

  it("never throws when both metadata writes fail", async () => {
    updateChatOrchestrationSnapshot.mockRejectedValueOnce(new Error("snapshot unavailable"));
    createGenerationTelemetryRecord.mockRejectedValueOnce(new Error("telemetry unavailable"));

    await expect(persistImportedRepoInitialization(initializationInput())).resolves.toEqual({
      snapshotPersisted: false,
      telemetryPersisted: false,
    });
  });
});

describe("recordImportedRepoPreviewOutcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordPreviewRuntimeOutcomeForVersion.mockResolvedValue(undefined);
  });

  it("records false for an explicit preview start failure", async () => {
    await expect(
      recordImportedRepoPreviewOutcome({
        versionId: "version_1",
        filesRevision: "revision_1",
        outcome: "failed",
      }),
    ).resolves.toBe(true);
    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith(
      "version_1",
      false,
      undefined,
    );
  });

  it("records true only for a runtime-ready receipt", async () => {
    await recordImportedRepoPreviewOutcome({
      versionId: "version_1",
      filesRevision: "revision_1",
      outcome: "runtime-ready",
    });
    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("version_1", true, {
      bootedFilesRevision: "revision_1",
    });
  });

  it("leaves a freshly queued runtime pending", async () => {
    await expect(
      recordImportedRepoPreviewOutcome({
        versionId: "version_1",
        filesRevision: "revision_1",
        outcome: "pending",
      }),
    ).resolves.toBe(false);
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
  });

  it("does not throw when preview telemetry fails", async () => {
    recordPreviewRuntimeOutcomeForVersion.mockRejectedValueOnce(new Error("telemetry unavailable"));

    await expect(
      recordImportedRepoPreviewOutcome({
        versionId: "version_1",
        outcome: "failed",
      }),
    ).resolves.toBe(false);
  });
});
