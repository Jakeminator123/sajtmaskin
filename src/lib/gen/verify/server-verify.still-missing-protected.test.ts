import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SM-034: a repair whose LLM output and fallback both lack a scaffold-protected
 * path must not persist. `reinjectProtectedPathsFromFallback` already reports
 * `stillMissing`; persist used to continue anyway.
 */

const failVersionVerification = vi.hoisted(() => vi.fn());
const saveRepairedFiles = vi.hoisted(() => vi.fn());
const markVersionRepairing = vi.hoisted(() => vi.fn());
const markVersionSupersededByRepair = vi.hoisted(() => vi.fn());
const renewVersionLease = vi.hoisted(() => vi.fn());
const getChat = vi.hoisted(() => vi.fn());
const getVersionFilesSnapshot = vi.hoisted(() => vi.fn());
const shouldPromoteAfterRepair = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const runRepairLoop = vi.hoisted(() => vi.fn());
const isLatestVersionForChat = vi.hoisted(() => vi.fn());
const buildExportableProject = vi.hoisted(() => vi.fn());
const chatUsesVerbatimRepo = vi.hoisted(() => vi.fn());

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
vi.mock("@/lib/utils/debug", () => ({ warnLog: vi.fn() }));
vi.mock("@/lib/gen/autofix/llm-repair-gate", () => ({
  RepairLedger: class RepairLedgerStub {},
}));
vi.mock("./preview-quality-gate", () => ({
  maybeAnalyzeVisualQAForPassedExportable: vi.fn(() => undefined),
  shouldPromoteAfterRepair,
}));
vi.mock("./repair-loop", () => ({
  runRepairLoop,
  buildGroupedRepairErrorContext: () => ({ errorManifest: [], contextLines: [] }),
  buildRepairErrorContextLines: () => [],
}));
vi.mock("./server-verify/lease", () => ({
  isLatestVersionForChat,
}));
vi.mock("@/lib/models/catalog", () => ({
  DEFAULT_MODEL_ID: "pro",
  ownModelIdToCanonicalModelId: () => null,
}));
vi.mock("@/lib/models/phase-routing", () => ({
  resolvePhaseModel: () => ({ modelId: "fixer-model" }),
  resolvePhaseThinking: () => null,
}));

import { serializeCodeProject } from "@/lib/gen/parser";
import { tryServerRepairLoop } from "./server-verify/repair-execution";

const PROTECTED_PATH = "app/api/placeholder/route.ts";

const pageFile = {
  path: "app/page.tsx",
  content: "export default function Page(){return null}",
  language: "tsx",
};

const llmProtectedFile = {
  path: PROTECTED_PATH,
  content: "export async function GET(){return null}",
  language: "ts",
};

const fallbackWithoutProtected = [pageFile];
const llmWithProtected = [pageFile, llmProtectedFile];

const baseFilesJson = JSON.stringify(fallbackWithoutProtected);

async function driveOnePromotion(projectContent: string) {
  runRepairLoop.mockImplementation(
    async (opts: {
      onAttemptPromotion: (
        content: string,
        method: "deterministic" | "llm",
      ) => Promise<{ promoted: boolean }>;
    }) => {
      const attempt = await opts.onAttemptPromotion(projectContent, "llm");
      return {
        promoted: attempt.promoted,
        remainingErrors: 0,
        llmPasses: 1,
        method: "llm",
        earlyStopReason: null,
        improvedSyntax: false,
        noContext: false,
        errorManifest: null,
      };
    },
  );
}

beforeEach(() => {
  failVersionVerification.mockReset().mockResolvedValue(null);
  saveRepairedFiles.mockReset().mockResolvedValue({
    status: "saved",
    version: { id: "ver-sm034", verification_summary: "ok", repair_available_at: null },
  });
  markVersionRepairing.mockReset().mockResolvedValue(null);
  markVersionSupersededByRepair.mockReset().mockResolvedValue(null);
  renewVersionLease.mockReset().mockResolvedValue(undefined);
  getChat.mockReset().mockResolvedValue(null);
  getVersionFilesSnapshot.mockReset().mockResolvedValue({
    files: fallbackWithoutProtected,
    filesJson: baseFilesJson,
  });
  shouldPromoteAfterRepair.mockReset().mockResolvedValue({
    promote: true,
    results: [],
    verifyLaneDurationMs: 1,
    firstFailureCheck: null,
    jobStartedAt: null,
    jobFinishedAt: null,
  });
  createEngineVersionErrorLogs.mockReset().mockResolvedValue(undefined);
  runRepairLoop.mockReset();
  isLatestVersionForChat.mockReset().mockResolvedValue(true);
  buildExportableProject.mockReset().mockImplementation(async (files: typeof pageFile[]) => files);
  chatUsesVerbatimRepo.mockReset().mockResolvedValue(false);
});

describe("tryServerRepairLoop — stillMissing protected path must not persist (SM-034)", () => {
  it("does not save when LLM output and fallback both lack a usable protected path", async () => {
    // LLM emitted the path (partition drops it) and fallback cannot restore it
    // — the prod stillMissing case on a scaffold chat (verbatim is skipped).
    await driveOnePromotion(serializeCodeProject(llmWithProtected));

    await tryServerRepairLoop({
      chatId: "chat-sm034",
      versionId: "ver-sm034",
      codeFiles: fallbackWithoutProtected,
      baseFilesJson,
      failedOutputs: [{ check: "typecheck", exitCode: 1, output: "boom", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: "typecheck",
      jobStartedAt: null,
      jobFinishedAt: null,
    });

    expect(saveRepairedFiles).not.toHaveBeenCalled();
    expect(failVersionVerification).toHaveBeenCalled();
    const failSummary = String(failVersionVerification.mock.calls[0]?.[1] ?? "");
    expect(failSummary).toContain(PROTECTED_PATH);
    expect(failSummary.toLowerCase()).toMatch(/not saved|was not saved|did not save/);
  });

  it("does not block save in verbatim mode when export injects a protected path absent from files_json", async () => {
    // Imported-repo repair starts from buildExportableProject(..., { verbatimRepo }),
    // which injects app/api/placeholder/route.ts for preview↔verify parity even
    // though that file is intentionally missing from persisted files_json.
    // The persist gate must not treat that injection as a missing scaffold file.
    chatUsesVerbatimRepo.mockResolvedValue(true);
    buildExportableProject.mockImplementation(
      async (files: Array<{ path: string }>, options?: { verbatimRepo?: boolean }) => {
        if (
          options?.verbatimRepo &&
          !files.some((file) => file.path === PROTECTED_PATH)
        ) {
          return [
            ...files,
            { path: PROTECTED_PATH, content: "injected", language: "ts" },
          ];
        }
        return files;
      },
    );
    await driveOnePromotion(serializeCodeProject(llmWithProtected));

    await tryServerRepairLoop({
      chatId: "chat-sm034",
      versionId: "ver-sm034",
      codeFiles: fallbackWithoutProtected,
      baseFilesJson,
      failedOutputs: [{ check: "typecheck", exitCode: 1, output: "boom", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: "typecheck",
      jobStartedAt: null,
      jobFinishedAt: null,
    });

    expect(saveRepairedFiles).toHaveBeenCalled();
    expect(runRepairLoop).toHaveBeenCalledWith(
      expect.objectContaining({ verbatimRepo: true }),
    );
    const failSummaries = failVersionVerification.mock.calls.map((call) =>
      String(call[1] ?? ""),
    );
    expect(failSummaries.some((summary) => summary.includes(PROTECTED_PATH))).toBe(
      false,
    );
  });

  it("does not save when a later pass would succeed after an earlier stillMissing block", async () => {
    const llmWithoutProtected = [pageFile];
    runRepairLoop.mockImplementation(
      async (opts: {
        onAttemptPromotion: (
          content: string,
          method: "deterministic" | "llm",
        ) => Promise<{ promoted: boolean }>;
      }) => {
        const first = await opts.onAttemptPromotion(
          serializeCodeProject(llmWithProtected),
          "deterministic",
        );
        const second = await opts.onAttemptPromotion(
          serializeCodeProject(llmWithoutProtected),
          "llm",
        );
        return {
          promoted: first.promoted || second.promoted,
          remainingErrors: 0,
          llmPasses: 1,
          method: "llm",
          earlyStopReason: null,
          improvedSyntax: false,
          noContext: false,
          errorManifest: null,
        };
      },
    );

    await tryServerRepairLoop({
      chatId: "chat-sm034",
      versionId: "ver-sm034",
      codeFiles: fallbackWithoutProtected,
      baseFilesJson,
      failedOutputs: [{ check: "typecheck", exitCode: 1, output: "boom", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: "typecheck",
      jobStartedAt: null,
      jobFinishedAt: null,
    });

    expect(saveRepairedFiles).not.toHaveBeenCalled();
    expect(failVersionVerification).toHaveBeenCalled();
    const failSummary = String(failVersionVerification.mock.calls[0]?.[1] ?? "");
    expect(failSummary).toContain(PROTECTED_PATH);
  });
});

describe("tryServerRepairLoop — omitted protected path must not vanish (SM-066)", () => {
  const iconFile = {
    path: "app/icon.svg",
    content: "<svg id='fallback-icon'/>",
    language: "svg",
  };
  const fallbackProtectedFile = {
    path: PROTECTED_PATH,
    content: "export async function GET(){return 'fallback'}",
    language: "ts",
  };
  const fallbackWithProtected = [pageFile, iconFile, fallbackProtectedFile];

  it("reinjects a never-mentioned protected path from fallback and persists it", async () => {
    await driveOnePromotion(serializeCodeProject([pageFile]));

    await tryServerRepairLoop({
      chatId: "chat-sm066",
      versionId: "ver-sm066",
      codeFiles: fallbackWithProtected,
      baseFilesJson: JSON.stringify(fallbackWithProtected),
      failedOutputs: [{ check: "typecheck", exitCode: 1, output: "boom", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: "typecheck",
      jobStartedAt: null,
      jobFinishedAt: null,
    });

    expect(saveRepairedFiles).toHaveBeenCalled();
    const savedJson = String(saveRepairedFiles.mock.calls[0]?.[1] ?? "");
    expect(savedJson).toContain("app/icon.svg");
    expect(savedJson).toContain(PROTECTED_PATH);
    expect(savedJson).toContain("fallback-icon");
    expect(savedJson).toContain("fallback");
    expect(failVersionVerification).not.toHaveBeenCalled();
  });

  it("blocks persist when the model omits a protected path and fallback lacks it", async () => {
    await driveOnePromotion(serializeCodeProject([pageFile]));

    await tryServerRepairLoop({
      chatId: "chat-sm066",
      versionId: "ver-sm066",
      codeFiles: fallbackWithoutProtected,
      baseFilesJson,
      failedOutputs: [{ check: "typecheck", exitCode: 1, output: "boom", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: "typecheck",
      jobStartedAt: null,
      jobFinishedAt: null,
    });

    expect(saveRepairedFiles).not.toHaveBeenCalled();
    expect(failVersionVerification).toHaveBeenCalled();
    const failSummary = String(failVersionVerification.mock.calls[0]?.[1] ?? "");
    expect(failSummary).toContain("app/icon.svg");
    expect(failSummary).toContain(PROTECTED_PATH);
    expect(failSummary.toLowerCase()).toMatch(/not saved|was not saved|did not save/);
  });
});
