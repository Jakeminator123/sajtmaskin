import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const markVersionVerifying = vi.hoisted(() => vi.fn());
const promoteVersion = vi.hoisted(() => vi.fn());
const failVersionVerification = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const buildExportableProject = vi.hoisted(() => vi.fn());
const isQualityGateConfigured = vi.hoisted(() => vi.fn());
const exportableToQualityGateFiles = vi.hoisted(() => vi.fn());
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
  markVersionVerifying,
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
  exportableToQualityGateFiles,
  isQualityGateConfigured,
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
});
