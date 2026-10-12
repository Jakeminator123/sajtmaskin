import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * C4: the server-verify `onAttemptPromotion` adapter must forward
 * `verifyDeadlineEpochMs` into `shouldPromoteAfterRepair`.
 */

const shouldPromoteAfterRepair = vi.hoisted(() => vi.fn());
const runRepairLoop = vi.hoisted(() => vi.fn());
const markVersionRepairing = vi.hoisted(() => vi.fn());
const failVersionVerification = vi.hoisted(() => vi.fn());
const saveRepairedFiles = vi.hoisted(() => vi.fn());
const getChat = vi.hoisted(() => vi.fn());
const markVersionSupersededByRepair = vi.hoisted(() => vi.fn());
const renewVersionLease = vi.hoisted(() => vi.fn());
const getVersionFilesSnapshot = vi.hoisted(() => vi.fn());
const buildExportableProject = vi.hoisted(() => vi.fn());
const chatUsesVerbatimRepo = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const isLatestVersionForChat = vi.hoisted(() => vi.fn());
const readServerRepairBudget = vi.hoisted(() => vi.fn());
const hydrateRepairLedger = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/services/server-repair-budget", () => ({ readServerRepairBudget }));

vi.mock("@/lib/db/client", () => ({ dbConfigured: true, db: {}, pool: null }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  markVersionRepairing,
  failVersionVerification,
  saveRepairedFiles,
  getChat,
  markVersionSupersededByRepair,
  renewVersionLease,
}));
vi.mock("@/lib/gen/version-manager", () => ({ getVersionFilesSnapshot }));
vi.mock("@/lib/gen/export/build-exportable-project", () => ({
  buildExportableProject,
  chatUsesVerbatimRepo,
}));
vi.mock("@/lib/db/services/version-errors", () => ({ createEngineVersionErrorLogs }));
vi.mock("@/lib/logging/event-bus", () => ({ emit: vi.fn() }));
vi.mock("@/lib/logging/event-bus-subscribers", () => ({}));
vi.mock("@/lib/logging/event-bus-error-log-sink", () => ({}));
vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend: vi.fn() }));
vi.mock("@/lib/logging/error-log-rag", () => ({ appendErrorLogEvent: vi.fn() }));
vi.mock("@/lib/logging/recurring-patterns-reader", () => ({
  readRecurringPatternsForChat: () => [],
}));
vi.mock("@/lib/gen/autofix/llm-repair-gate", () => {
  class RepairLedger {
    static hydrate(...args: unknown[]) { hydrateRepairLedger(...args); return new RepairLedger(); }
  }
  return { RepairLedger, runLlmRepairGate: vi.fn() };
});
vi.mock("../preview-quality-gate", () => ({
  shouldPromoteAfterRepair,
  maybeAnalyzeVisualQAForPassedExportable: vi.fn(() => null),
}));
vi.mock("../repair-loop", () => ({
  runRepairLoop,
  buildGroupedRepairErrorContext: () => ({ errorManifest: [], contextLines: [] }),
  buildRepairErrorContextLines: () => [],
}));
vi.mock("./lease", () => ({ isLatestVersionForChat }));
vi.mock("./f3-readiness", () => ({
  evaluateServerOwnedF3Readiness: vi.fn(),
  persistF3ReadinessHold: vi.fn(),
  resolveSnapshotFilesRevision: () => "rev",
}));

import { serializeCodeProject } from "@/lib/gen/parser";
import { tryServerRepairLoop } from "./repair-execution";

const pageFile = {
  path: "app/page.tsx",
  content: "export default function Page(){return <main/>}",
  language: "tsx",
};
const iconFile = {
  path: "app/icon.svg",
  content: "<svg id='scaffold-icon'/>",
  language: "svg",
};
const placeholderFile = {
  path: "app/api/placeholder/route.ts",
  content: "export async function GET(){return null}",
  language: "ts",
};
const projectFiles = [pageFile, iconFile, placeholderFile];

describe("tryServerRepairLoop threads verifyDeadlineEpochMs (C4)", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1_699_999_999_000);
    markVersionRepairing.mockReset().mockResolvedValue(null);
    failVersionVerification.mockReset().mockResolvedValue(null);
    saveRepairedFiles.mockReset().mockResolvedValue({ status: "failed" });
    getChat.mockReset().mockResolvedValue({ id: "chat-c4" });
    markVersionSupersededByRepair.mockReset().mockResolvedValue(null);
    renewVersionLease.mockReset().mockResolvedValue(true);
    getVersionFilesSnapshot.mockReset().mockResolvedValue({
      files: projectFiles,
      filesJson: JSON.stringify(projectFiles),
    });
    buildExportableProject.mockReset().mockImplementation(async (files: typeof projectFiles) => files);
    chatUsesVerbatimRepo.mockReset().mockResolvedValue(false);
    createEngineVersionErrorLogs.mockReset().mockResolvedValue(undefined);
    isLatestVersionForChat.mockReset().mockResolvedValue(true);
    shouldPromoteAfterRepair.mockReset().mockResolvedValue({
      promote: false,
      results: [],
      verifyLaneDurationMs: 1,
      firstFailureCheck: "typecheck",
      jobStartedAt: null,
      jobFinishedAt: null,
    });
    runRepairLoop.mockReset();
    readServerRepairBudget.mockReset().mockResolvedValue({ status: "history_unknown" });
    hydrateRepairLedger.mockReset();
  });

  it("forwards the repair-loop final-gate deadline into shouldPromoteAfterRepair", async () => {
    const verifyDeadlineEpochMs = 1_700_000_000_000;
    runRepairLoop.mockImplementation(
      async (params: {
        onAttemptPromotion: (
          content: string,
          method: "deterministic" | "llm",
          options?: { verifyDeadlineEpochMs?: number },
        ) => Promise<{ promoted: boolean }>;
      }) => {
        await params.onAttemptPromotion(serializeCodeProject(projectFiles), "llm", {
          verifyDeadlineEpochMs,
        });
        return {
          promoted: false,
          method: "llm",
          llmPasses: 1,
          earlyStopReason: "no_improvement",
          remainingErrors: 0,
          improvedSyntax: false,
          noContext: false,
          errorManifest: [],
        };
      },
    );

    await tryServerRepairLoop({
      chatId: "chat-c4",
      versionId: "ver-c4",
      codeFiles: projectFiles,
      baseFilesJson: JSON.stringify(projectFiles),
      failedOutputs: [
        {
          check: "typecheck",
          exitCode: 1,
          output: "TS2322",
        },
      ],
      verifyLaneDurationMs: 10,
      firstFailureCheck: "typecheck",
      jobStartedAt: null,
      jobFinishedAt: null,
      previewPolicy: "fidelity2",
      repairDeadlineEpochMs: verifyDeadlineEpochMs + 5_000,
      repairAuthority: "manual",
    });

    expect(shouldPromoteAfterRepair).toHaveBeenCalledWith(
      expect.objectContaining({ verifyDeadlineEpochMs }),
    );
  });

  it("hydrates authenticated history with its original scope and retains occupied slots", async () => {
    const identity = { contentHash: "a".repeat(16), diagnosticFingerprint: "b".repeat(16), requiredFiles: ["app/page.tsx"], outcome: "success" as const };
    const consumed = [{ ...identity, passIndex: 0, slot: "primary" as const }];
    readServerRepairBudget.mockResolvedValue({ status: "ready", snapshot: { scopeId: "original:root", finalize: [identity], consumed } });
    runRepairLoop.mockResolvedValue({ stopped: true });
    await tryServerRepairLoop({ chatId: "chat-c4", versionId: "ver-c4", codeFiles: projectFiles, baseFilesJson: JSON.stringify(projectFiles),
      baseFilesRevision: "actual-db-revision", runId: "run2", repairScopeId: "caller-must-not-replace-scope",
      failedOutputs: [], verifyLaneDurationMs: 0, firstFailureCheck: null, jobStartedAt: null, jobFinishedAt: null });
    expect(readServerRepairBudget).toHaveBeenCalledWith({ chatId: "chat-c4", versionId: "ver-c4", runId: "run2", filesRevision: "actual-db-revision" });
    expect(hydrateRepairLedger).toHaveBeenCalledWith("chat-c4", "original:root", [identity, ...consumed]);
    expect(runRepairLoop).toHaveBeenCalledWith(expect.objectContaining({ repairScopeId: "original:root", serverRepairBudget: {
      target: { chatId: "chat-c4", versionId: "ver-c4", runId: "run2", filesRevision: "actual-db-revision", scopeId: "original:root" }, consumed,
    } }));
  });

  it.each(["before_pass", "before_gate", "before_save"] as const)(
    "renew crossing the original deadline at %s stops without another LLM/gate/save", async (stage) => {
      const deadline = Date.now() + 100;
      renewVersionLease.mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(deadline); return true; });
      if (stage === "before_save") renewVersionLease.mockResolvedValueOnce(true);
      shouldPromoteAfterRepair.mockResolvedValue({ promote: true, results: [], verifyLaneDurationMs: 1 });
      const paidStep = vi.fn();
      runRepairLoop.mockImplementation(async (params) => {
        if (stage === "before_pass") { await params.onBeforePass(0); paidStep(); }
        else await params.onAttemptPromotion(serializeCodeProject(projectFiles), "llm");
        return { stopped: true };
      });
      const result = await tryServerRepairLoop({ chatId: "chat-c4", versionId: "ver-c4", runId: "held",
        codeFiles: projectFiles, baseFilesJson: JSON.stringify(projectFiles), failedOutputs: [],
        verifyLaneDurationMs: 0, firstFailureCheck: null, jobStartedAt: null, jobFinishedAt: null,
        previewPolicy: "fidelity2", repairAuthority: "manual", repairDeadlineEpochMs: deadline });
      expect(result).toMatchObject({ stop: { reason: "time_budget_exceeded", retryable: true } });
      expect(paidStep).not.toHaveBeenCalled();
      expect(saveRepairedFiles).not.toHaveBeenCalled();
      expect(failVersionVerification).not.toHaveBeenCalled();
      if (stage !== "before_save") expect(shouldPromoteAfterRepair).not.toHaveBeenCalled();
    },
  );

  it("clamps callback gate and every LLM attempt to the remaining original window", async () => {
    const deadline = Date.now() + 100;
    runRepairLoop.mockImplementation(async (params) => {
      expect(params.llmTimeoutMs).toBe(100);
      vi.mocked(Date.now).mockReturnValue(deadline - 20);
      expect(params.llmRetryTimeoutMs).toBe(20);
      await params.onAttemptPromotion(serializeCodeProject(projectFiles), "deterministic", {
        verifyDeadlineEpochMs: deadline + 5_000,
      });
      vi.mocked(Date.now).mockReturnValue(deadline);
      expect(() => params.llmRetryTimeoutMs).toThrow("time budget exhausted");
      return { stopped: true };
    });
    await tryServerRepairLoop({ chatId: "chat-c4", versionId: "ver-c4", codeFiles: projectFiles,
      baseFilesJson: JSON.stringify(projectFiles), failedOutputs: [], verifyLaneDurationMs: 0,
      firstFailureCheck: null, jobStartedAt: null, jobFinishedAt: null, repairAuthority: "manual",
      repairDeadlineEpochMs: deadline });
    expect(shouldPromoteAfterRepair).toHaveBeenCalledWith(expect.objectContaining({ verifyDeadlineEpochMs: deadline }));
    expect(failVersionVerification).not.toHaveBeenCalled();
  });

  it.each(["before_pass", "before_gate", "before_save"] as const)(
    "renew false or throw at %s returns typed STOP before further paid/gate/save work", async (stage) => {
      for (const throws of [false, true]) {
        vi.clearAllMocks();
        renewVersionLease.mockReset();
        if (stage === "before_save") renewVersionLease.mockResolvedValueOnce(true);
        if (throws) renewVersionLease.mockRejectedValue(new Error("renew unavailable"));
        else renewVersionLease.mockResolvedValue(false);
        shouldPromoteAfterRepair.mockResolvedValue({ promote: true, results: [], verifyLaneDurationMs: 1,
          firstFailureCheck: null, jobStartedAt: null, jobFinishedAt: null });
        const paidStep = vi.fn();
        runRepairLoop.mockImplementation(async (params) => {
          if (stage === "before_pass") {
            await params.onBeforePass(0);
            paidStep();
          } else {
            await params.onAttemptPromotion(serializeCodeProject(projectFiles), "llm");
          }
          return { stopped: true };
        });
        const outcome = await tryServerRepairLoop({
          chatId: "chat-c4", versionId: "ver-c4", runId: "held", codeFiles: projectFiles,
          baseFilesJson: JSON.stringify(projectFiles), baseFilesRevision: "actual",
          failedOutputs: [], verifyLaneDurationMs: 0, firstFailureCheck: null,
          jobStartedAt: null, jobFinishedAt: null, previewPolicy: "fidelity2", repairAuthority: "manual",
        });
        expect(outcome).toMatchObject({ stop: { reason: "lease_lost", retryable: true }, reverifyCurrent: false });
        expect(paidStep).not.toHaveBeenCalled();
        expect(saveRepairedFiles).not.toHaveBeenCalled();
        expect(failVersionVerification).not.toHaveBeenCalled();
        expect(renewVersionLease).toHaveBeenCalledTimes(stage === "before_save" ? 2 : 1);
        if (stage !== "before_save") expect(shouldPromoteAfterRepair).not.toHaveBeenCalled();
      }
    },
  );

  it.each(["missing_revision", "history_unknown", "unavailable"])("never substitutes a fresh automatic ledger after %s", async (reason) => {
    readServerRepairBudget.mockResolvedValue({ status: reason });
    await expect(tryServerRepairLoop({ chatId: "chat-c4", versionId: "ver-c4", codeFiles: projectFiles, baseFilesJson: JSON.stringify(projectFiles),
      baseFilesRevision: reason === "missing_revision" ? undefined : "actual", runId: "run2", failedOutputs: [],
      verifyLaneDurationMs: 0, firstFailureCheck: null, jobStartedAt: null, jobFinishedAt: null })).resolves.toMatchObject({
        stop: { reason: "repair_budget_unavailable", retryable: true },
      });
    expect(runRepairLoop).not.toHaveBeenCalled();
    expect(markVersionRepairing).not.toHaveBeenCalled();
    expect(saveRepairedFiles).not.toHaveBeenCalled();
  });
});
