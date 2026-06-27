import { beforeEach, describe, expect, it, vi } from "vitest";

// Codex P2 (stale snapshot): the repair route must acquire the per-version
// lease BEFORE reading the version files, so it never repairs a snapshot a
// concurrent job already replaced. These tests pin that ordering + the 409
// busy path + lease release, exiting early via the empty-files 404 so the full
// repair machinery never has to be mocked.

const withRateLimit = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getVersionFilesSnapshot = vi.hoisted(() => vi.fn());
const acquireVersionLease = vi.hoisted(() => vi.fn());
const releaseVersionLease = vi.hoisted(() => vi.fn());
const renewVersionLease = vi.hoisted(() => vi.fn());
const markVersionRepairing = vi.hoisted(() => vi.fn());
const failVersionVerification = vi.hoisted(() => vi.fn());
const failVersionVerificationIfUnleased = vi.hoisted(() => vi.fn());
const saveRepairedFiles = vi.hoisted(() => vi.fn());
const getChat = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const runRepairLoop = vi.hoisted(() => vi.fn());
const shouldPromoteAfterRepair = vi.hoisted(() => vi.fn());
const triggerServerVerification = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: unknown, _key: string, fn: () => unknown) => {
    withRateLimit();
    return fn();
  },
}));
vi.mock("@/lib/tenant", () => ({ getEngineVersionForChatByIdForRequest }));
vi.mock("@/lib/db/client", () => ({ dbConfigured: true }));
vi.mock("@/lib/gen/version-manager", () => ({ getVersionFilesSnapshot }));
vi.mock("@/lib/db/services/version-errors", () => ({ createEngineVersionErrorLogs }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  markVersionRepairing,
  failVersionVerification,
  failVersionVerificationIfUnleased,
  saveRepairedFiles,
  getChat,
  acquireVersionLease,
  releaseVersionLease,
  renewVersionLease,
}));
vi.mock("@/lib/gen/export/build-exportable-project", () => ({
  buildExportableProject: vi.fn(async (f: unknown) => f),
}));
vi.mock("@/lib/gen/verify/preview-quality-gate", () => ({
  maybeAnalyzeVisualQAForPassedExportable: vi.fn(() => undefined),
  shouldPromoteAfterRepair,
}));
// #260 round-2 (Codex P2): on a stale_base no-op the route re-verifies the
// current files (B) on a fresh lease. Mock it so we can assert the trigger.
vi.mock("@/lib/gen/verify/server-verify", () => ({ triggerServerVerification }));
// Mock the repair loop so we can drive a single promotion attempt without the
// real LLM-fixer machinery. The route's other repair-loop helpers are stubbed.
vi.mock("@/lib/gen/verify/repair-loop", () => ({
  runRepairLoop,
  buildGroupedRepairErrorContext: () => ({ errorManifest: [], contextLines: [] }),
  buildRepairErrorContextLines: () => [],
}));
vi.mock("@/lib/gen/parser", () => ({
  parseCodeProject: () => ({
    files: [{ path: "app/page.tsx", content: "x", language: "tsx" }],
  }),
}));
vi.mock("@/lib/gen/scaffolds/protected-paths", () => ({
  partitionGeneratedFilesForProtectedPaths: (files: unknown[]) => ({
    kept: files,
    dropped: [],
  }),
  reinjectProtectedPathsFromFallback: ({ kept }: { kept: unknown[] }) => ({
    files: kept,
    reinjected: [],
    stillMissing: [],
  }),
}));
vi.mock("@/lib/models/catalog", () => ({ ownModelIdToCanonicalModelId: () => null }));
vi.mock("@/lib/models/phase-routing", () => ({
  resolvePhaseModel: () => ({ modelId: "fixer-model" }),
  resolvePhaseThinking: () => null,
}));
vi.mock("@/lib/logging/recurring-patterns-reader", () => ({
  readRecurringPatternsForChat: () => [],
}));
vi.mock("@/lib/logging/devLog", () => ({ devLogAppend: vi.fn() }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/engine/chats/chat-1/repair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST repair — lease before snapshot (Codex P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    acquireVersionLease.mockResolvedValue({ runId: "run-1" });
    releaseVersionLease.mockResolvedValue(undefined);
    createEngineVersionErrorLogs.mockResolvedValue([]);
    triggerServerVerification.mockResolvedValue(undefined);
  });

  it("acquires the lease BEFORE reading version files", async () => {
    getVersionFilesSnapshot.mockResolvedValue({ files: [], filesJson: "[]" }); // empty -> early 404 after acquire+read

    const res = await POST(req({ versionId: "ver-1", repairContext: {} }), {
      params: Promise.resolve({ chatId: "chat-1" }),
    });

    expect(res.status).toBe(404);
    expect(acquireVersionLease).toHaveBeenCalledWith("ver-1", "manual_repair");
    // Ordering proof: acquire was invoked before the snapshot read.
    expect(acquireVersionLease.mock.invocationCallOrder[0]).toBeLessThan(
      getVersionFilesSnapshot.mock.invocationCallOrder[0],
    );
    // Lease released in finally even on the early 404.
    expect(releaseVersionLease).toHaveBeenCalledWith("ver-1", "run-1");
    // No stale-base no-op -> no re-verify.
    expect(triggerServerVerification).not.toHaveBeenCalled();
  });

  it("returns 409 version_busy without reading files when another job owns the lease", async () => {
    acquireVersionLease.mockResolvedValue(null);
    getVersionFilesSnapshot.mockResolvedValue({
      files: [{ path: "app/page.tsx", content: "x" }],
      filesJson: '[{"path":"app/page.tsx","content":"x"}]',
    });

    const res = await POST(req({ versionId: "ver-1", repairContext: {} }), {
      params: Promise.resolve({ chatId: "chat-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("version_busy");
    expect(getVersionFilesSnapshot).not.toHaveBeenCalled();
    expect(markVersionRepairing).not.toHaveBeenCalled();
  });
});

describe("POST repair — stale-base no-op must not fail the user's newer edit (#260 P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    acquireVersionLease.mockResolvedValue({ runId: "run-1" });
    releaseVersionLease.mockResolvedValue(undefined);
    renewVersionLease.mockResolvedValue(undefined);
    markVersionRepairing.mockResolvedValue(undefined);
    createEngineVersionErrorLogs.mockResolvedValue([]);
    getChat.mockResolvedValue(undefined);
    triggerServerVerification.mockResolvedValue(undefined);
    getVersionFilesSnapshot.mockResolvedValue({
      files: [{ path: "app/page.tsx", content: "A" }],
      filesJson: '[{"path":"app/page.tsx","content":"A"}]',
    });
    // The repaired files pass the post-repair gate, so the route attempts a save.
    shouldPromoteAfterRepair.mockResolvedValue({ promote: true, results: [] });
    // The save no-ops because a concurrent user edit advanced files_json.
    saveRepairedFiles.mockResolvedValue({ status: "stale_base" });
    // Drive exactly one promotion attempt through the (mocked) repair loop.
    runRepairLoop.mockImplementation(
      async (opts: {
        onAttemptPromotion: (
          content: string,
          method: "deterministic" | "llm",
        ) => Promise<{ promoted: boolean; payload: { newVersionId: string | null } }>;
      }) => {
        const attempt = await opts.onAttemptPromotion(
          '```tsx file="app/page.tsx"\nx\n```',
          "llm",
        );
        return {
          promoted: attempt.promoted,
          remainingErrors: 0,
          llmPasses: 1,
          method: "llm",
          payload: attempt.payload,
          earlyStopReason: null,
          improvedSyntax: false,
          noContext: false,
          errorManifest: null,
        };
      },
    );
  });

  it("does NOT call failVersionVerification and reports superseded when the save is stale_base", async () => {
    const res = await POST(
      req({
        versionId: "ver-1",
        repairContext: { qualityGate: [{ check: "typecheck", exitCode: 1, output: "boom" }] },
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );
    const body = await res.json();

    // The repair was attempted and the base was threaded through to the save.
    expect(saveRepairedFiles).toHaveBeenCalledTimes(1);
    expect(saveRepairedFiles.mock.calls[0]?.[4]).toBe(
      '[{"path":"app/page.tsx","content":"A"}]',
    );
    // The newer edit B must NOT be finalized as failed by either path.
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
    // The response surfaces the concurrent edit instead of a fake failure.
    expect(res.status).toBe(200);
    expect(body.repaired).toBe(false);
    expect(body.status).toBe("superseded");
    // Lease still released in finally.
    expect(releaseVersionLease).toHaveBeenCalledWith("ver-1", "run-1");
    // #260 round-2: the current files (B) are re-verified on a fresh lease so B
    // reaches an honest terminal state instead of lingering in `repairing`.
    expect(triggerServerVerification).toHaveBeenCalledWith({
      chatId: "chat-1",
      versionId: "ver-1",
    });
    // …and the re-verify is fired AFTER this run's lease is released.
    expect(releaseVersionLease.mock.invocationCallOrder[0]).toBeLessThan(
      triggerServerVerification.mock.invocationCallOrder[0],
    );
  });

  it("does NOT re-verify on a successful (non-stale) repair save (happy path)", async () => {
    // The save succeeds: the repair is promoted to `repair_available`, so there
    // is no concurrent-edit supersession and no re-verify should be triggered.
    saveRepairedFiles.mockResolvedValue({
      status: "saved",
      version: { id: "ver-1", verification_summary: null, repair_available_at: null },
    });

    const res = await POST(
      req({
        versionId: "ver-1",
        repairContext: { qualityGate: [{ check: "typecheck", exitCode: 1, output: "boom" }] },
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.repaired).toBe(true);
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(triggerServerVerification).not.toHaveBeenCalled();
  });
});
