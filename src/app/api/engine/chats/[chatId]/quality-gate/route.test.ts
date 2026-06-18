import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const markVersionVerifying = vi.hoisted(() => vi.fn());
const markVersionSupersededByRepair = vi.hoisted(() => vi.fn());
const promoteVersion = vi.hoisted(() => vi.fn());
const failVersionVerification = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const buildExportableProject = vi.hoisted(() => vi.fn());
const isQualityGateConfigured = vi.hoisted(() => vi.fn());
const exportableToQualityGateFiles = vi.hoisted(() => vi.fn());
const maybeAnalyzeVisualQAForPassedExportable = vi.hoisted(() => vi.fn());
const describeQualityGateVerification = vi.hoisted(() => vi.fn());
const runQualityGateChecks = vi.hoisted(() => vi.fn());
const qualityGateAllPassed = vi.hoisted(() => vi.fn());
const buildServerVerifyQualityGateMeta = vi.hoisted(() => vi.fn());
const compactVisualQAForQualityGateLog = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs,
}));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  failVersionVerification,
  getLatestVersion,
  markVersionVerifying,
  markVersionSupersededByRepair,
  promoteVersion,
}));

vi.mock("@/lib/gen/export/build-exportable-project", () => ({
  buildExportableProject,
}));

vi.mock("@/lib/gen/verify/preview-quality-gate", () => ({
  QUALITY_GATE_COMMANDS: {
    typecheck: "npx tsc --noEmit",
    build: "npx next build",
    lint: "npx eslint . --max-warnings=0",
  },
  QUALITY_GATE_SETUP_HINT: "hint",
  QualityGateNotConfiguredError: class QualityGateNotConfiguredError extends Error {},
  describeQualityGateVerification,
  exportableToQualityGateFiles,
  isQualityGateConfigured,
  maybeAnalyzeVisualQAForPassedExportable,
  runQualityGateChecks,
  qualityGateAllPassed,
}));

vi.mock("@/lib/gen/verify/server-verify-log-meta", () => ({
  buildServerVerifyQualityGateMeta,
  compactVisualQAForQualityGateLog,
}));

import { POST } from "./route";

describe("POST quality-gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    markVersionVerifying.mockResolvedValue({ id: "ver-1" });
    markVersionSupersededByRepair.mockResolvedValue({ id: "ver-1" });
    createEngineVersionErrorLogs.mockResolvedValue([]);
    failVersionVerification.mockResolvedValue({ id: "ver-1" });
    promoteVersion.mockResolvedValue({ id: "ver-1" });
    maybeAnalyzeVisualQAForPassedExportable.mockReturnValue(undefined);
    describeQualityGateVerification.mockReturnValue("Automatic verification passed.");
  });

  it("rejects an empty checks array before touching verify dependencies", async () => {
    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: [] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(JSON.stringify(body.details)).toContain("At least one quality gate check is required.");
    expect(getEngineVersionForChatByIdForRequest).not.toHaveBeenCalled();
    expect(getVersionFiles).not.toHaveBeenCalled();
    expect(runQualityGateChecks).not.toHaveBeenCalled();
  });

  it("marks the result superseded when a newer version exists before state mutation", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([{ path: "app/page.tsx", content: "export default function Page(){}" }]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([{ path: "app/page.tsx", content: "export default function Page(){}" }]);
    exportableToQualityGateFiles.mockReturnValue([{ name: "app/page.tsx", content: "export default function Page(){}" }]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-2" });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.superseded).toBe(true);
    expect(markVersionSupersededByRepair).toHaveBeenCalledWith("ver-1");
    expect(promoteVersion).not.toHaveBeenCalled();
  });

  it("marks the version failed when the promote guard blocks a passed gate", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    // Finalize verifier flagged blocking findings → promoteVersion's invariant
    // guard refuses and returns null even though the VM gate passed.
    promoteVersion.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(promoteVersion).toHaveBeenCalledWith("ver-1", expect.any(String));
    expect(failVersionVerification).toHaveBeenCalledWith(
      "ver-1",
      expect.stringContaining("promotion was blocked"),
    );
    // The payload must not read as fully green: VM-gate status is preserved
    // but an explicit promotion marker is surfaced.
    expect(body.passed).toBe(true);
    expect(body.promotionBlocked).toBe(true);
    expect(body.promotionBlockedReason).toBe("finalize_quality_gate_failed");
  });

  it("promotes a clean passed gate when the guard allows it", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat-1" },
      version: { id: "ver-1" },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    isQualityGateConfigured.mockReturnValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    exportableToQualityGateFiles.mockReturnValue([
      { name: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    runQualityGateChecks.mockResolvedValue({
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 10 }],
      verifyLaneDurationMs: 10,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-13T10:00:00.000Z",
      jobFinishedAt: "2026-04-13T10:00:00.010Z",
    });
    qualityGateAllPassed.mockReturnValue(true);
    buildServerVerifyQualityGateMeta.mockReturnValue({});
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    // Guard allows promotion (default mock returns a truthy promoted row).
    promoteVersion.mockResolvedValue({ id: "ver-1" });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/quality-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver-1", checks: ["typecheck"] }),
      }),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(promoteVersion).toHaveBeenCalledWith("ver-1", expect.any(String));
    expect(failVersionVerification).not.toHaveBeenCalled();
    expect(body.promotionBlocked).toBeUndefined();
  });
});
