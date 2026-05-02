import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const detectIntegrationsFromVersionFiles = vi.hoisted(() => vi.fn());
const resolveSelectedDossiersFromSnapshot = vi.hoisted(() => vi.fn());
const deriveTier3BuildSpec = vi.hoisted(() => vi.fn());
const validateTier3Readiness = vi.hoisted(() => vi.fn());
const getStoredProjectEnvVarMap = vi.hoisted(() => vi.fn());
const readAllowPlaceholdersInF3 = vi.hoisted(() => vi.fn());
const loadPlaceholderKeySet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getLatestVersion,
  getPreferredVersion,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
}));

vi.mock("@/lib/gen/detect-integrations", () => ({
  detectIntegrationsFromVersionFiles,
}));

vi.mock("@/lib/gen/dossiers/snapshot-selection", () => ({
  resolveSelectedDossiersFromSnapshot,
}));

vi.mock("@/lib/integrations/tier3-build-spec", () => ({
  deriveTier3BuildSpec,
  validateTier3Readiness,
}));

vi.mock("@/lib/project-env-vars", () => ({
  getStoredProjectEnvVarMap,
  readAllowPlaceholdersInF3,
}));

vi.mock("@/lib/gen/preview/env-local", () => ({
  loadPlaceholderKeySet,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/engine/chats/chat_1/finalize-design", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST finalize-design", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: null,
      orchestration_snapshot: null,
    });
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: {
        id: "ver_current",
        chat_id: "chat_1",
        lifecycle_stage: "design",
      },
    });
    getPreferredVersion.mockResolvedValue({
      id: "ver_current",
      chat_id: "chat_1",
      lifecycle_stage: "design",
    });
    getLatestVersion.mockResolvedValue(null);
    resolveSelectedDossiersFromSnapshot.mockReturnValue([]);
    getVersionFiles.mockResolvedValue([]);
    detectIntegrationsFromVersionFiles.mockReturnValue([]);
    deriveTier3BuildSpec.mockReturnValue({ requirements: [] });
    validateTier3Readiness.mockReturnValue({ ready: true, missingByIntegration: [] });
    getStoredProjectEnvVarMap.mockResolvedValue({});
    readAllowPlaceholdersInF3.mockResolvedValue(false);
    loadPlaceholderKeySet.mockReturnValue(new Set());
  });

  it("rejects an explicit stale design version before deriving F3 requirements", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: {
        id: "ver_old",
        chat_id: "chat_1",
        lifecycle_stage: "design",
      },
    });
    getPreferredVersion.mockResolvedValue({
      id: "ver_new",
      chat_id: "chat_1",
      lifecycle_stage: "design",
    });

    const res = await POST(request({ versionId: "ver_old" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.reason).toBe("stale_design_version");
    expect(body.requestedVersionId).toBe("ver_old");
    expect(body.latestVersionId).toBe("ver_new");
    expect(getVersionFiles).not.toHaveBeenCalled();
  });

  it("allows the preferred design version and returns the F3 parent id", async () => {
    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ready?: boolean;
      parentVersionId?: string;
      streamMeta?: { lifecycleStage?: string; parentVersionId?: string };
    };
    expect(body.ready).toBe(true);
    expect(body.parentVersionId).toBe("ver_current");
    expect(body.streamMeta).toEqual({
      lifecycleStage: "integrations",
      parentVersionId: "ver_current",
    });
  });
});
