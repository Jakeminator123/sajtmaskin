import { beforeEach, describe, expect, it, vi } from "vitest";

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
  class RepairLedger {}
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
  beforeEach(() => {
    markVersionRepairing.mockReset().mockResolvedValue(null);
    failVersionVerification.mockReset().mockResolvedValue(null);
    saveRepairedFiles.mockReset().mockResolvedValue({ status: "failed" });
    getChat.mockReset().mockResolvedValue({ id: "chat-c4" });
    markVersionSupersededByRepair.mockReset().mockResolvedValue(null);
    renewVersionLease.mockReset().mockResolvedValue(undefined);
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
    });

    expect(shouldPromoteAfterRepair).toHaveBeenCalledWith(
      expect.objectContaining({ verifyDeadlineEpochMs }),
    );
  });
});
