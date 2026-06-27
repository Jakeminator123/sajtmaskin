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
  shouldPromoteAfterRepair: vi.fn(async () => ({ promote: false, results: [] })),
}));

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
