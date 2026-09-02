import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L1: server-verify must not promote an F3 version without the shared
 * readiness gate (env, F2 parent, L2 postcheck domain).
 */

const promoteVersion = vi.hoisted(() => vi.fn());
const failVersionVerification = vi.hoisted(() => vi.fn());
const resetVersionVerificationToPending = vi.hoisted(() => vi.fn());
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
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const emitBusEvent = vi.hoisted(() => vi.fn());
const checkTier3ReadinessForVersion = vi.hoisted(() => vi.fn());
const runLlmRepairGate = vi.hoisted(() => vi.fn());
const runAutoFix = vi.hoisted(() => vi.fn());
const runDeterministicImportRepair = vi.hoisted(() => vi.fn());
const runRepairLoop = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ dbConfigured: true, db: {}, pool: null }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  promoteVersion,
  failVersionVerification,
  resetVersionVerificationToPending,
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
vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend: vi.fn() }));
vi.mock("@/lib/logging/error-log-rag", () => ({ appendErrorLogEvent: vi.fn() }));
vi.mock("@/lib/logging/recurring-patterns-reader", () => ({
  readRecurringPatternsForChat: () => [],
}));
vi.mock("@/lib/gen/autofix/pipeline", () => ({ runAutoFix }));
vi.mock("@/lib/gen/autofix/deterministic-import-repair", () => ({
  runDeterministicImportRepair,
}));
vi.mock("@/lib/gen/autofix/llm-repair-gate", () => {
  class RepairLedger {}
  return { RepairLedger, runLlmRepairGate };
});
vi.mock("./preview-quality-gate", () => ({
  isQualityGateConfigured,
  runQualityGateOnExportable,
  qualityGateAllPassed,
  shouldPromoteAfterRepair,
  maybeAnalyzeVisualQAForPassedExportable,
}));
vi.mock("./repair-loop", () => ({
  runRepairLoop,
  runDeterministicRepairPrepass: vi.fn(),
  buildGroupedRepairErrorContext: () => ({ errorManifest: [], contextLines: [] }),
  buildRepairErrorContextLines: () => [],
}));
vi.mock("./tier3-readiness", () => ({
  checkTier3ReadinessForVersion,
  serverOwnedF3ReadinessParams: (input: Record<string, unknown>) => ({
    ...input,
    requireF2Parent: true,
    productPostcheckVersionId: input.parentVersionId ?? undefined,
  }),
  md5FilesRevision: (json: string) => `md5:${String(json).length}`,
}));

import { serializeCodeProject } from "@/lib/gen/parser";
import { triggerServerVerification } from "./server-verify";

const chatId = "chat-l1";
const versionId = "ver-f3";

const pageFile = {
  path: "app/page.tsx",
  content: "export default function Page(){return null}",
  language: "tsx",
};
const projectFiles = [pageFile];
const filesJson = JSON.stringify(projectFiles);

function gatePass() {
  return {
    results: [
      {
        check: "typecheck",
        passed: true,
        repairable: false,
        failureKind: null,
        exitCode: 0,
        output: "",
        durationMs: 10,
      },
      {
        check: "build",
        passed: true,
        repairable: false,
        failureKind: null,
        exitCode: 0,
        output: "",
        durationMs: 20,
      },
    ],
    verifyLaneDurationMs: 30,
    firstFailureCheck: null,
    jobStartedAt: null,
    jobFinishedAt: null,
  };
}

function gateFailTypecheck() {
  return {
    results: [
      {
        check: "typecheck",
        passed: false,
        repairable: true,
        failureKind: "code" as const,
        exitCode: 2,
        output: "app/page.tsx(1,1): error TS2322",
        durationMs: 10,
      },
    ],
    verifyLaneDurationMs: 10,
    firstFailureCheck: "typecheck",
    jobStartedAt: null,
    jobFinishedAt: null,
  };
}

beforeEach(() => {
  promoteVersion.mockReset().mockResolvedValue({ id: versionId });
  failVersionVerification.mockReset().mockResolvedValue(null);
  resetVersionVerificationToPending.mockReset().mockResolvedValue({ id: versionId });
  saveRepairedFiles.mockReset().mockResolvedValue({ status: "failed" });
  updateVersionFiles.mockReset().mockResolvedValue(true);
  markVersionVerifying.mockReset().mockResolvedValue(null);
  markVersionRepairing.mockReset().mockResolvedValue(null);
  acquireVersionLease.mockReset().mockResolvedValue({ runId: "run-l1" });
  releaseVersionLease.mockReset().mockResolvedValue(undefined);
  renewVersionLease.mockReset().mockResolvedValue(undefined);
  getPreferredVersion.mockReset().mockResolvedValue({ id: versionId });
  getLatestVersion.mockReset().mockResolvedValue({ id: versionId });
  getChat.mockReset().mockResolvedValue({
    id: chatId,
    project_id: "proj_1",
    orchestration_snapshot: null,
  });
  markVersionSupersededByRepair.mockReset().mockResolvedValue(null);
  getVersionFilesSnapshot.mockReset().mockResolvedValue({
    files: projectFiles,
    filesJson,
    lifecycleStage: "integrations",
    filesRevision: "rev_f3",
    parentVersionId: "ver_f2",
    verificationState: "pending",
  });
  runQualityGateOnExportable.mockReset().mockResolvedValue(gatePass());
  qualityGateAllPassed.mockReset().mockReturnValue(true);
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
  runRepairLoop.mockReset();
  runAutoFix.mockReset().mockImplementation(async (content: string) => ({
    fixedContent: content,
    fixes: [],
  }));
  runDeterministicImportRepair.mockReset().mockImplementation((content: string) => ({
    content,
    fixed: false,
    fixes: [],
    handledCodes: [],
    cannotFindSummary: { resolved: [], residual: [] },
  }));
  checkTier3ReadinessForVersion.mockReset().mockResolvedValue({
    ready: true,
    ok: true,
    spec: { requirements: [] },
  });
});

describe("triggerServerVerification F3 readiness (L1)", () => {
  it("(a) missing env → ingen promotion", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ready: false,
      ok: false,
      reason: "missing_env",
      retryable: false,
      spec: { requirements: [] },
      readiness: { ready: false, missingByIntegration: [] },
    });

    await triggerServerVerification({ chatId, versionId });

    expect(promoteVersion).not.toHaveBeenCalled();
    expect(runQualityGateOnExportable).not.toHaveBeenCalled();
    expect(createEngineVersionErrorLogs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          category: "server-verify:f3-readiness",
          meta: expect.objectContaining({ reason: "missing_env", at: "before_first_gate" }),
        }),
      ]),
    );
  });

  it("(b) blockerad F2-parent → ingen promotion", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ready: false,
      ok: false,
      reason: "product_postcheck_blocked",
      verdict: "blocked",
      retryable: false,
    });

    await triggerServerVerification({ chatId, versionId });

    expect(promoteVersion).not.toHaveBeenCalled();
    expect(runQualityGateOnExportable).not.toHaveBeenCalled();
  });

  it("(c) pending/indeterminate → ingen promotion, retry", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ready: false,
      ok: false,
      reason: "product_postcheck_pending",
      verdict: "pending",
      retryable: true,
    });

    await triggerServerVerification({ chatId, versionId });

    expect(promoteVersion).not.toHaveBeenCalled();
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(createEngineVersionErrorLogs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          category: "server-verify:f3-readiness",
          level: "warning",
          meta: expect.objectContaining({
            reason: "product_postcheck_pending",
            retryable: true,
          }),
        }),
      ]),
    );
  });

  it("(d) DB-fel i readiness → ingen promotion", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ready: false,
      ok: false,
      reason: "readiness_unavailable",
      retryable: true,
    });

    await triggerServerVerification({ chatId, versionId });

    expect(promoteVersion).not.toHaveBeenCalled();
    expect(runQualityGateOnExportable).not.toHaveBeenCalled();
  });

  it("(e) readiness körs om efter reparation och före promotion", async () => {
    const fixedContent = serializeCodeProject([
      { ...pageFile, content: "export default function Page(){return <main/>}" },
    ]);
    runQualityGateOnExportable.mockResolvedValue(gateFailTypecheck());
    qualityGateAllPassed.mockReturnValue(false);
    shouldPromoteAfterRepair.mockResolvedValue({
      promote: true,
      results: gatePass().results,
      verifyLaneDurationMs: 5,
      firstFailureCheck: null,
      jobStartedAt: null,
      jobFinishedAt: null,
    });
    saveRepairedFiles.mockResolvedValue({
      status: "saved",
      version: { id: versionId, verification_summary: "ok", repair_available_at: null },
    });
    runRepairLoop.mockImplementation(async (params: {
      onAttemptPromotion: (
        content: string,
        method: "deterministic" | "llm",
      ) => Promise<{ promoted: boolean }>;
    }) => {
      const attempt = await params.onAttemptPromotion(fixedContent, "deterministic");
      return { promoted: attempt.promoted, method: "deterministic", llmPasses: 0 };
    });

    await triggerServerVerification({ chatId, versionId });

    expect(checkTier3ReadinessForVersion.mock.invocationCallOrder[0]).toBeLessThan(
      runQualityGateOnExportable.mock.invocationCallOrder[0],
    );
    expect(runRepairLoop).toHaveBeenCalled();
    expect(checkTier3ReadinessForVersion).toHaveBeenCalledTimes(2);
    expect(checkTier3ReadinessForVersion.mock.invocationCallOrder[1]).toBeGreaterThan(
      runRepairLoop.mock.invocationCallOrder[0],
    );
    expect(promoteVersion).not.toHaveBeenCalled();
  });

  it("(e-pass) readiness före första gaten och omedelbart före promotion", async () => {
    await triggerServerVerification({ chatId, versionId });

    expect(checkTier3ReadinessForVersion).toHaveBeenCalledTimes(2);
    expect(checkTier3ReadinessForVersion.mock.invocationCallOrder[0]).toBeLessThan(
      runQualityGateOnExportable.mock.invocationCallOrder[0],
    );
    expect(checkTier3ReadinessForVersion.mock.invocationCallOrder[1]).toBeLessThan(
      promoteVersion.mock.invocationCallOrder[0],
    );
    expect(checkTier3ReadinessForVersion.mock.invocationCallOrder[1]).toBeGreaterThan(
      runQualityGateOnExportable.mock.invocationCallOrder[0],
    );
    expect(promoteVersion).toHaveBeenCalledWith(
      versionId,
      "Automatic server verification passed.",
      "run-l1",
    );
  });

  it("(f) passed + ready preview + env ok → promotion", async () => {
    await triggerServerVerification({ chatId, versionId });

    expect(promoteVersion).toHaveBeenCalledWith(
      versionId,
      "Automatic server verification passed.",
      "run-l1",
    );
    expect(emitBusEvent).toHaveBeenCalledWith(
      expect.objectContaining({ t: "version.verifier.done", outcome: "passed" }),
    );
    expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId,
        chatId,
        parentVersionId: "ver_f2",
        requireF2Parent: true,
        filesRevision: "rev_f3",
      }),
    );
  });

  it("before_promotion-hold: ingen passed-buss, ingen grön gatelogg, pending istället för promotion", async () => {
    checkTier3ReadinessForVersion
      .mockResolvedValueOnce({
        ready: true,
        ok: true,
        spec: { requirements: [] },
      })
      .mockResolvedValueOnce({
        ready: false,
        ok: false,
        reason: "product_postcheck_pending",
        verdict: "pending",
        retryable: true,
      });

    await triggerServerVerification({ chatId, versionId });

    expect(runQualityGateOnExportable).toHaveBeenCalled();
    expect(promoteVersion).not.toHaveBeenCalled();
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(resetVersionVerificationToPending).toHaveBeenCalledWith(
      versionId,
      expect.stringContaining("product_postcheck_pending"),
      "run-l1",
    );
    expect(emitBusEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        t: "version.verifier.done",
        outcome: "pending",
        reason: "product_postcheck_pending",
      }),
    );
    expect(emitBusEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ t: "version.verifier.done", outcome: "passed" }),
    );
    expect(createEngineVersionErrorLogs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          category: "server-verify:f3-readiness",
          meta: expect.objectContaining({
            reason: "product_postcheck_pending",
            at: "before_promotion",
          }),
        }),
      ]),
    );
    expect(
      createEngineVersionErrorLogs.mock.calls.some((call) =>
        (call[0] as Array<{ category?: string; message?: string }>).some(
          (row) =>
            row.category === "preflight:quality-gate" &&
            row.message === "Server verify passed.",
        ),
      ),
    ).toBe(false);
  });
});
