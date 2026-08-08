import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SM-024: diagnosticOnly must still run mechanical (deterministic) repair when
 * the VM gate has repairable code failures, while never promoting and never
 * entering LLM repair.
 */

const promoteVersion = vi.hoisted(() => vi.fn());
const failVersionVerification = vi.hoisted(() => vi.fn());
const saveRepairedFiles = vi.hoisted(() => vi.fn());
const updateVersionFiles = vi.hoisted(() => vi.fn());
const markVersionVerifying = vi.hoisted(() => vi.fn());
const markVersionRepairing = vi.hoisted(() => vi.fn());
const acquireVersionLease = vi.hoisted(() => vi.fn());
const releaseVersionLease = vi.hoisted(() => vi.fn());
const renewVersionLease = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const getChat = vi.hoisted(() => vi.fn());
const markVersionSupersededByRepair = vi.hoisted(() => vi.fn());
const getVersionFilesSnapshot = vi.hoisted(() => vi.fn());
const runQualityGateOnExportable = vi.hoisted(() => vi.fn());
const qualityGateAllPassed = vi.hoisted(() => vi.fn());
const shouldPromoteAfterRepair = vi.hoisted(() => vi.fn());
const isQualityGateConfigured = vi.hoisted(() => vi.fn(() => true));
const maybeAnalyzeVisualQAForPassedExportable = vi.hoisted(() => vi.fn(() => null));
const buildExportableProject = vi.hoisted(() => vi.fn());
const chatUsesVerbatimRepo = vi.hoisted(() => vi.fn());
const runAutoFix = vi.hoisted(() => vi.fn());
const runDeterministicImportRepair = vi.hoisted(() => vi.fn());
const runLlmRepairGate = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const emitBusEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ dbConfigured: true, db: {}, pool: null }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  promoteVersion,
  failVersionVerification,
  saveRepairedFiles,
  updateVersionFiles,
  markVersionVerifying,
  markVersionRepairing,
  acquireVersionLease,
  releaseVersionLease,
  renewVersionLease,
  getPreferredVersion,
  getLatestVersion,
  getChat,
  markVersionSupersededByRepair,
}));
vi.mock("@/lib/gen/version-manager", () => ({ getVersionFilesSnapshot }));
vi.mock("@/lib/gen/export/build-exportable-project", () => ({
  buildExportableProject,
  chatUsesVerbatimRepo,
}));
vi.mock("@/lib/db/services/version-errors", () => ({ createEngineVersionErrorLogs }));
vi.mock("@/lib/logging/event-bus", () => ({ emit: emitBusEvent }));
vi.mock("@/lib/logging/event-bus-subscribers", () => ({}));
vi.mock("@/lib/logging/event-bus-error-log-sink", () => ({}));
vi.mock("@/lib/logging/devLog", () => ({ devLogAppend: vi.fn() }));
vi.mock("@/lib/logging/error-log-rag", () => ({ appendErrorLogEvent: vi.fn() }));
vi.mock("@/lib/logging/recurring-patterns-reader", () => ({
  readRecurringPatternsForChat: () => [],
}));
vi.mock("@/lib/gen/autofix/pipeline", () => ({ runAutoFix }));
vi.mock("@/lib/gen/autofix/deterministic-import-repair", () => ({
  runDeterministicImportRepair,
}));
vi.mock("@/lib/gen/autofix/llm-repair-gate", () => {
  class RepairLedger {
    // no-op test double
  }
  return { RepairLedger, runLlmRepairGate };
});
vi.mock("./preview-quality-gate", () => ({
  isQualityGateConfigured,
  runQualityGateOnExportable,
  qualityGateAllPassed,
  shouldPromoteAfterRepair,
  maybeAnalyzeVisualQAForPassedExportable,
}));

import { serializeCodeProject } from "@/lib/gen/parser";
import { triggerServerVerification } from "./server-verify";

const chatId = "chat-sm024";
const versionId = "version-sm024";

const pageFile = {
  path: "components/map-display.tsx",
  content: `export async function Map() {\n  const maplibregl = (await import("maplibre-gl")).default;\n  return maplibregl;\n}\n`,
  language: "tsx",
};

const fixedPageContent = `export async function Map() {\n  const maplibregl = await import("maplibre-gl");\n  return maplibregl;\n}\n`;

const filesJson = JSON.stringify([pageFile]);

function gateFailTypecheck() {
  return {
    results: [
      {
        check: "typecheck",
        passed: false,
        repairable: true,
        failureKind: "code" as const,
        exitCode: 2,
        output:
          "components/map-display.tsx(2,45): error TS2339: Property 'default' does not exist on type 'typeof import(\"maplibre-gl\")'.",
        durationMs: 40,
      },
    ],
    verifyLaneDurationMs: 40,
    firstFailureCheck: "typecheck",
    jobStartedAt: null,
    jobFinishedAt: null,
  };
}

beforeEach(() => {
  promoteVersion.mockReset().mockResolvedValue(null);
  failVersionVerification.mockReset().mockResolvedValue(null);
  saveRepairedFiles.mockReset().mockResolvedValue({ status: "failed" });
  updateVersionFiles.mockReset().mockResolvedValue(true);
  markVersionVerifying.mockReset().mockResolvedValue(null);
  markVersionRepairing.mockReset().mockResolvedValue(null);
  acquireVersionLease.mockReset().mockResolvedValue({ runId: "run-sm024" });
  releaseVersionLease.mockReset().mockResolvedValue(undefined);
  renewVersionLease.mockReset().mockResolvedValue(undefined);
  getPreferredVersion.mockReset().mockResolvedValue({ id: versionId });
  getLatestVersion.mockReset().mockResolvedValue({ id: versionId });
  getChat.mockReset().mockResolvedValue(null);
  markVersionSupersededByRepair.mockReset().mockResolvedValue(null);
  getVersionFilesSnapshot.mockReset().mockResolvedValue({
    files: [pageFile],
    filesJson,
    lifecycleStage: "integrations",
  });
  runQualityGateOnExportable.mockReset().mockResolvedValue(gateFailTypecheck());
  qualityGateAllPassed.mockReset().mockReturnValue(false);
  shouldPromoteAfterRepair.mockReset().mockResolvedValue({
    promote: false,
    results: gateFailTypecheck().results,
    verifyLaneDurationMs: 1,
    firstFailureCheck: "typecheck",
    jobStartedAt: null,
    jobFinishedAt: null,
  });
  isQualityGateConfigured.mockReset().mockReturnValue(true);
  maybeAnalyzeVisualQAForPassedExportable.mockReset().mockReturnValue(null);
  buildExportableProject.mockReset().mockImplementation(async (files: typeof pageFile[]) => files);
  chatUsesVerbatimRepo.mockReset().mockResolvedValue(false);
  createEngineVersionErrorLogs.mockReset().mockResolvedValue(undefined);
  emitBusEvent.mockReset();
  runLlmRepairGate.mockReset();

  const initialSerialized = serializeCodeProject([pageFile]);
  const fixedSerialized = serializeCodeProject([
    { ...pageFile, content: fixedPageContent },
  ]);
  runAutoFix.mockReset().mockImplementation(async (content: string) => ({
    fixedContent: content === initialSerialized ? fixedSerialized : content,
    fixes: [{ fixer: "mechanical-test", file: pageFile.path }],
  }));
  runDeterministicImportRepair.mockReset().mockImplementation((content: string) => ({
    content,
    fixed: false,
    fixes: [],
    handledCodes: [],
    cannotFindSummary: { resolved: [], residual: [] },
  }));
});

describe("triggerServerVerification diagnosticOnly + repairable gate (SM-024)", () => {
  it("runs deterministic repair, skips LLM repair, and never promotes", async () => {
    await triggerServerVerification({
      chatId,
      versionId,
      diagnosticOnly: true,
    });

    expect(runAutoFix).toHaveBeenCalled();
    expect(runLlmRepairGate).not.toHaveBeenCalled();
    expect(markVersionRepairing).not.toHaveBeenCalled();
    expect(promoteVersion).not.toHaveBeenCalled();
    expect(saveRepairedFiles).not.toHaveBeenCalled();
    expect(updateVersionFiles).toHaveBeenCalledWith(
      versionId,
      expect.any(String),
      expect.objectContaining({
        holderRunId: "run-sm024",
        expectedFilesJson: filesJson,
      }),
    );
    expect(failVersionVerification).toHaveBeenCalledWith(
      versionId,
      expect.stringMatching(/typecheck/),
      "run-sm024",
    );
    // Honesty note: gate findings were produced on PRE-repair content, and the
    // summary must say so once deterministic fixes were persisted afterwards.
    const failSummary = failVersionVerification.mock.calls[0]?.[1] as string;
    expect(failSummary).toMatch(/pre-repair content/);

    const diagnosticLogs = createEngineVersionErrorLogs.mock.calls
      .flatMap((call) => call[0] as Array<{ category?: string; message?: string; meta?: Record<string, unknown> }>)
      .filter((row) => row.category === "server-verify:diagnostic");
    expect(diagnosticLogs.length).toBeGreaterThan(0);
    expect(diagnosticLogs.some((row) => /deterministic/i.test(row.message ?? ""))).toBe(true);
    expect(
      diagnosticLogs.some((row) =>
        /auto-repair suppressed \(verifier blockers already exist/i.test(row.message ?? ""),
      ),
    ).toBe(false);
  });

  it("bugbot: skips persist when the version is superseded mid-verify", async () => {
    // The gate can run for minutes after the run-start latest-check. If a
    // newer version becomes preferred meanwhile, the deterministic repair may
    // still RUN (diagnostics), but must never rewrite the superseded row's
    // files_json.
    getPreferredVersion
      .mockResolvedValueOnce({ id: versionId }) // run-start latest-check passes
      .mockResolvedValue({ id: "version-newer" }); // persist-time guard sees a newer version

    await triggerServerVerification({
      chatId,
      versionId,
      diagnosticOnly: true,
    });

    expect(updateVersionFiles).not.toHaveBeenCalled();
    expect(promoteVersion).not.toHaveBeenCalled();
    expect(runLlmRepairGate).not.toHaveBeenCalled();

    const diagnosticLogs = createEngineVersionErrorLogs.mock.calls
      .flatMap((call) => call[0] as Array<{ category?: string; meta?: Record<string, unknown> }>)
      .filter((row) => row.category === "server-verify:diagnostic");
    expect(
      diagnosticLogs.some(
        (row) =>
          (row.meta?.deterministicRepair as { skippedPersistReason?: string } | undefined)
            ?.skippedPersistReason === "superseded_by_newer_version",
      ),
    ).toBe(true);
    // Nothing was persisted, so the fail summary must not claim otherwise.
    const failSummary = failVersionVerification.mock.calls[0]?.[1] as string;
    expect(failSummary).not.toMatch(/pre-repair content/);
  });
});
