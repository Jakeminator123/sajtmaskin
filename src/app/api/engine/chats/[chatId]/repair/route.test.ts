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
const afterCallbacks = vi.hoisted(() => ({ value: [] as Array<() => unknown> }));

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
// Capture after() callbacks (stale-base re-verify is scheduled via after()) so
// we can assert + run them instead of executing post-response in the test.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      afterCallbacks.value.push(cb);
    },
  };
});
vi.mock("@/lib/gen/verify/server-verify", () => ({ triggerServerVerification }));

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
    afterCallbacks.value = [];
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
    // #260 P2: the current files (B) are re-verified on a fresh lease, scheduled
    // via after() (NOT a detached fire-and-forget). Run the scheduled callback
    // and assert it re-verifies this version.
    expect(afterCallbacks.value).toHaveLength(1);
    triggerServerVerification.mockResolvedValue(undefined);
    await afterCallbacks.value[0]?.();
    expect(triggerServerVerification).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "chat-1", versionId: "ver-1" }),
    );
  });
});

describe("POST repair — no-context AND stale-base must not fail the user's newer edit (#260 P2)", () => {
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
    afterCallbacks.value = [];
    getVersionFilesSnapshot.mockResolvedValue({
      files: [{ path: "app/page.tsx", content: "A" }],
      filesJson: '[{"path":"app/page.tsx","content":"A"}]',
    });
    shouldPromoteAfterRepair.mockResolvedValue({ promote: true, results: [] });
    // The save no-ops because a concurrent user edit advanced files_json.
    saveRepairedFiles.mockResolvedValue({ status: "stale_base" });
    // Drive a promotion attempt (which sets staleBaseNoOp) and THEN the
    // no-context branch. onNoContext must be guarded so it does NOT fail the
    // version once a stale-base no-op has occurred.
    runRepairLoop.mockImplementation(
      async (opts: {
        onAttemptPromotion: (
          content: string,
          method: "deterministic" | "llm",
        ) => Promise<{ promoted: boolean; payload: { newVersionId: string | null } }>;
        onNoContext?: () => Promise<void> | void;
      }) => {
        await opts.onAttemptPromotion('```tsx file="app/page.tsx"\nx\n```', "llm");
        await opts.onNoContext?.();
        return {
          promoted: false,
          remainingErrors: 0,
          llmPasses: 1,
          method: "llm",
          payload: { newVersionId: null },
          earlyStopReason: null,
          improvedSyntax: false,
          noContext: true,
          errorManifest: null,
        };
      },
    );
  });

  it("skips the no-context failVersionVerification and reports superseded on stale_base", async () => {
    const res = await POST(req({ versionId: "ver-1", repairContext: {} }), {
      params: Promise.resolve({ chatId: "chat-1" }),
    });
    const body = await res.json();

    // The no-context branch must NOT finalize the user's newer edit B as failed
    // from the stale repair(A).
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
    // Surfaced as superseded, not a plain no-context result that would imply B
    // itself is unrepairable.
    expect(res.status).toBe(200);
    expect(body.repaired).toBe(false);
    expect(body.status).toBe("superseded");
    // B is re-verified on a fresh lease, scheduled via after().
    expect(afterCallbacks.value).toHaveLength(1);
    triggerServerVerification.mockResolvedValue(undefined);
    await afterCallbacks.value[0]?.();
    expect(triggerServerVerification).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "chat-1", versionId: "ver-1" }),
    );
  });
});

describe("POST repair — build-originated stale-base re-verify forces the build gate (#265 F1)", () => {
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
    afterCallbacks.value = [];
    getVersionFilesSnapshot.mockResolvedValue({
      files: [{ path: "app/page.tsx", content: "A" }],
      filesJson: '[{"path":"app/page.tsx","content":"A"}]',
    });
    shouldPromoteAfterRepair.mockResolvedValue({ promote: true, results: [] });
    // A concurrent user edit advanced files_json, so the save no-ops.
    saveRepairedFiles.mockResolvedValue({ status: "stale_base" });
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

  it("threads forceBuildCheck:true into the after() re-verify when the repair was build-originated", async () => {
    const res = await POST(
      req({
        versionId: "ver-1",
        // Build-origin is driven by a `build` quality-gate failure.
        repairContext: {
          qualityGate: [{ check: "build", exitCode: 1, output: "next build failed" }],
        },
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );
    const body = await res.json();

    expect(body.status).toBe("superseded");
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
    // The scheduled re-verify of B must keep `build` in its gate so a still-broken
    // next build cannot be false-greened by the typecheck-only design-preview lane.
    expect(afterCallbacks.value).toHaveLength(1);
    triggerServerVerification.mockResolvedValue(undefined);
    await afterCallbacks.value[0]?.();
    expect(triggerServerVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        versionId: "ver-1",
        forceBuildCheck: true,
      }),
    );
  });

  it("drives the build gate via qualityGateMeta.firstFailureCheck === 'build' too", async () => {
    const res = await POST(
      req({
        versionId: "ver-1",
        repairContext: { qualityGateMeta: { firstFailureCheck: "build" } },
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );
    const body = await res.json();

    expect(body.status).toBe("superseded");
    expect(afterCallbacks.value).toHaveLength(1);
    triggerServerVerification.mockResolvedValue(undefined);
    await afterCallbacks.value[0]?.();
    expect(triggerServerVerification).toHaveBeenCalledWith(
      expect.objectContaining({ forceBuildCheck: true }),
    );
  });
});

describe("POST repair — non-promoted repair re-checks base before failing (#265 F3)", () => {
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
    afterCallbacks.value = [];
    // First read = base (A). The post-loop stale-base re-check reads again and
    // sees the user's newer edit (B) — files_json advanced past base.
    getVersionFilesSnapshot
      .mockResolvedValueOnce({
        files: [{ path: "app/page.tsx", content: "A" }],
        filesJson: '[{"path":"app/page.tsx","content":"A"}]',
      })
      .mockResolvedValue({
        files: [{ path: "app/page.tsx", content: "B" }],
        filesJson: '[{"path":"app/page.tsx","content":"B"}]',
      });
    // The loop exhausts without promoting and WITHOUT a stale_base save signal
    // (promotion gate never passed, so saveRepairedFiles is never reached).
    runRepairLoop.mockResolvedValue({
      promoted: false,
      remainingErrors: 0,
      llmPasses: 1,
      method: "llm",
      payload: { newVersionId: null },
      earlyStopReason: null,
      improvedSyntax: false,
      noContext: false,
      errorManifest: null,
    });
  });

  it("skips failVersionVerification and reports superseded when files_json advanced past base", async () => {
    const res = await POST(
      req({
        versionId: "ver-1",
        repairContext: { qualityGate: [{ check: "typecheck", exitCode: 1, output: "boom" }] },
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );
    const body = await res.json();

    // No promotion attempt reached saveRepairedFiles on this path.
    expect(saveRepairedFiles).not.toHaveBeenCalled();
    // The newer edit B must NOT be finalized as failed from the stale repair(A).
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(body.repaired).toBe(false);
    expect(body.status).toBe("superseded");
    // B is re-verified on a fresh lease, scheduled via after().
    expect(afterCallbacks.value).toHaveLength(1);
    triggerServerVerification.mockResolvedValue(undefined);
    await afterCallbacks.value[0]?.();
    expect(triggerServerVerification).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "chat-1", versionId: "ver-1" }),
    );
  });

  it("still fails the version when files_json is unchanged (true unrepairable B)", async () => {
    // Base stays A on the re-check — no concurrent edit, so the version is
    // genuinely unrepairable and must be finalized as failed (not superseded).
    getVersionFilesSnapshot.mockReset();
    getVersionFilesSnapshot.mockResolvedValue({
      files: [{ path: "app/page.tsx", content: "A" }],
      filesJson: '[{"path":"app/page.tsx","content":"A"}]',
    });
    failVersionVerification.mockResolvedValue({ id: "ver-1" });

    const res = await POST(
      req({
        versionId: "ver-1",
        repairContext: { qualityGate: [{ check: "typecheck", exitCode: 1, output: "boom" }] },
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );
    const body = await res.json();

    expect(failVersionVerification).toHaveBeenCalledTimes(1);
    expect(body.status).toBe("completed");
    // No stale-base recovery scheduled when nothing advanced.
    expect(afterCallbacks.value).toHaveLength(0);
  });
});
