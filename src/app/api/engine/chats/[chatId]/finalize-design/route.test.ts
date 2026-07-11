import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const getVersionsByChat = vi.hoisted(() => vi.fn());
const createDraftVersion = vi.hoisted(() => vi.fn());
const checkTier3ReadinessForVersion = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getLatestVersion,
  getPreferredVersion,
  getVersionsByChat,
  createDraftVersion,
}));

vi.mock("@/lib/integrations/tier3-readiness-gate", () => ({
  checkTier3ReadinessForVersion,
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
        files_json: '[{"path":"app/page.tsx","content":"F2 exact"}]',
      },
    });
    getPreferredVersion.mockResolvedValue({
      id: "ver_current",
      chat_id: "chat_1",
      lifecycle_stage: "design",
      files_json: '[{"path":"app/page.tsx","content":"F2 exact"}]',
    });
    getLatestVersion.mockResolvedValue(null);
    getVersionsByChat.mockResolvedValue([]);
    createDraftVersion.mockResolvedValue({
      id: "ver_f3_exact",
      chat_id: "chat_1",
      lifecycle_stage: "integrations",
      parent_version_id: "ver_current",
      files_json: '[{"path":"app/page.tsx","content":"F2 exact"}]',
      release_state: "draft",
      verification_state: "pending",
    });
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: true,
      spec: { requirements: [] },
    });
  });

  it("blocks F3 server-side when the newest product_postcheck.summary is productBlocked (Codex P1 r3)", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: false,
      reason: "product_postcheck_blocked",
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ready).toBe(false);
    expect(body.reason).toBe("product_postcheck_blocked");
    expect(checkTier3ReadinessForVersion).toHaveBeenCalledWith({
      versionId: "ver_current",
      orchestrationSnapshot: null,
      projectId: null,
    });
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
    expect(checkTier3ReadinessForVersion).not.toHaveBeenCalled();
  });

  it("does not fall back when an explicit version is outside the tenant/chat scope", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue(null);

    const res = await POST(request({ versionId: "ver_foreign" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Version not found for chat" });
    expect(getPreferredVersion).not.toHaveBeenCalled();
    expect(checkTier3ReadinessForVersion).not.toHaveBeenCalled();
  });

  it("does not greenlight F3 when version files are unavailable (G#21)", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: false,
      reason: "version_files_unavailable",
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ready).toBe(false);
    expect(body.reason).toBe("version_files_unavailable");
  });

  it("returns retryable 409 semantics when the shared readiness gate throws", async () => {
    checkTier3ReadinessForVersion.mockRejectedValue(
      new Error("transient db read"),
    );

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      ready: false,
      reason: "version_files_unavailable",
      parentVersionId: "ver_current",
    });
  });

  it("keeps F2 files and visual fallback when no real build key is required", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: true,
      spec: {
        requirements: [
          {
            key: "openai",
            name: "OpenAI",
            requiredRealEnvKeys: [],
            featureRuntimeEnvKeys: ["OPENAI_API_KEY"],
            warnOnlyEnvKeys: [],
          },
        ],
      },
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ready: true,
      action: "deterministic_release",
      parentVersionId: "ver_current",
      versionId: "ver_f3_exact",
      lifecycleStage: "integrations",
      gateRequired: true,
      releaseState: "draft",
      verificationState: "pending",
    });
    expect(body.streamMeta).toBeUndefined();
    expect(body.requirements).toEqual([
      expect.objectContaining({
        key: "openai",
        featureRuntimeEnvKeys: ["OPENAI_API_KEY"],
      }),
    ]);
    expect(createDraftVersion).toHaveBeenCalledWith(
      "chat_1",
      null,
      '[{"path":"app/page.tsx","content":"F2 exact"}]',
      undefined,
      {
        stage: "integrations",
        parentVersionId: "ver_current",
      },
    );
  });

  it("uses the deterministic exact-file F3 fork for an empty spec", async () => {
    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      action: "deterministic_release",
      versionId: "ver_f3_exact",
      requirements: [],
    });
    expect(createDraftVersion).toHaveBeenCalledTimes(1);
  });

  it("reuses an already-promoted exact F3 fork without demoting it", async () => {
    getVersionsByChat.mockResolvedValue([
      {
        id: "ver_f3_newer_draft",
        chat_id: "chat_1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver_current",
        files_json: '[{"path":"app/page.tsx","content":"F2 exact"}]',
        release_state: "draft",
        verification_state: "pending",
      },
      {
        id: "ver_f3_existing",
        chat_id: "chat_1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver_current",
        files_json: '[{"path":"app/page.tsx","content":"F2 exact"}]',
        release_state: "promoted",
        verification_state: "passed",
      },
    ]);

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toMatchObject({
      action: "deterministic_release",
      versionId: "ver_f3_existing",
      gateRequired: false,
      reused: true,
      releaseState: "promoted",
      verificationState: "passed",
    });
    expect(createDraftVersion).not.toHaveBeenCalled();
  });

  it("reuses an existing draft exact-file F3 fork on retry", async () => {
    getVersionsByChat.mockResolvedValue([
      {
        id: "ver_f3_draft",
        chat_id: "chat_1",
        lifecycle_stage: "integrations",
        parent_version_id: "ver_current",
        files_json: '[{"path":"app/page.tsx","content":"F2 exact"}]',
        release_state: "draft",
        verification_state: "pending",
      },
    ]);

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toMatchObject({
      action: "deterministic_release",
      versionId: "ver_f3_draft",
      gateRequired: true,
      reused: true,
      releaseState: "draft",
      verificationState: "pending",
    });
    expect(createDraftVersion).not.toHaveBeenCalled();
  });

  it("returns retryable 409 semantics when deterministic fork persistence fails", async () => {
    getVersionsByChat.mockRejectedValue(new Error("transient db error"));

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      ready: false,
      reason: "f3_fork_unavailable",
      parentVersionId: "ver_current",
    });
  });

  it("keeps the existing 412 requirements path when a real build key is missing", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: false,
      reason: "missing_env",
      spec: {
        requirements: [
          {
            key: "clerk",
            name: "Clerk",
            requiredRealEnvKeys: ["CLERK_SECRET_KEY"],
          },
        ],
      },
      readiness: {
        ready: false,
        missingByIntegration: [
          { key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY"] },
        ],
      },
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(412);
    expect(body).toMatchObject({
      ready: false,
      parentVersionId: "ver_current",
      missingByIntegration: [
        { key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY"] },
      ],
    });
    expect(body.action).toBeUndefined();
  });

  it("preserves the gated F3 stream path when a required build key is ready", async () => {
    checkTier3ReadinessForVersion.mockResolvedValue({
      ok: true,
      spec: {
        requirements: [
          {
            key: "openai",
            name: "OpenAI",
            requiredRealEnvKeys: [],
          },
          {
            key: "clerk",
            name: "Clerk",
            requiredRealEnvKeys: ["CLERK_SECRET_KEY"],
          },
        ],
      },
    });

    const res = await POST(request({ versionId: "ver_current" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ready?: boolean;
      action?: string;
      parentVersionId?: string;
      streamMeta?: { lifecycleStage?: string; parentVersionId?: string };
    };
    expect(body.ready).toBe(true);
    expect(body.action).toBeUndefined();
    expect(body.parentVersionId).toBe("ver_current");
    expect(body.streamMeta).toEqual({
      lifecycleStage: "integrations",
      parentVersionId: "ver_current",
    });
    expect(createDraftVersion).not.toHaveBeenCalled();
  });
});
