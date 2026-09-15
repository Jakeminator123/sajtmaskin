import { beforeEach, describe, expect, it, vi } from "vitest";

const createProject = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());
const findLatestTemplateInitProjectIdForOwner = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const commitCredits = vi.hoisted(() => vi.fn());
const resolveAppProjectIdForRequest = vi.hoisted(() => vi.fn());
const getLocalV0TemplateSourceById = vi.hoisted(() => vi.fn());
const loadLocalV0TemplateFiles = vi.hoisted(() => vi.fn());
const startPreviewSession = vi.hoisted(() => vi.fn());
const chatRepoCreateChat = vi.hoisted(() => vi.fn());
const chatRepoAddMessage = vi.hoisted(() => vi.fn());
const chatRepoCreateDraftVersion = vi.hoisted(() => vi.fn());
const chatRepoUpdateVersionPreviewUrl = vi.hoisted(() => vi.fn());
const chatRepoGetChat = vi.hoisted(() => vi.fn());
const chatRepoListChatsByProject = vi.hoisted(() => vi.fn());
const chatRepoGetPreferredVersion = vi.hoisted(() => vi.fn());
const chatRepoGetLatestVersion = vi.hoisted(() => vi.fn());
const chatRepoGetChatOrchestrationSnapshot = vi.hoisted(() => vi.fn());
const devLogAppend = vi.hoisted(() => vi.fn());
const persistImportedRepoInitialization = vi.hoisted(() => vi.fn());
const recordImportedRepoPreviewOutcome = vi.hoisted(() => vi.fn());
const claimState = vi.hoisted(() => ({
  store: new Map<
    string,
    {
      claimKey: string;
      operationId: string;
      status: "pending" | "completed" | "failed";
      claimGeneration: number;
      projectId: string | null;
      chatId: string | null;
      versionId: string | null;
    }
  >(),
  seq: 0,
  bindResult: true,
  recordResult: true,
  completeResult: true,
}));

vi.mock("@/lib/db/services/projects", () => ({
  createProject,
  saveProjectData,
  getProjectData,
  findLatestTemplateInitProjectIdForOwner,
}));

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/auth/session", () => ({
  ensureSessionIdFromRequest: () => ({ sessionId: "sess_1", setCookie: null }),
}));

vi.mock("@/lib/credits/server", () => ({
  prepareCredits,
}));

vi.mock("@/lib/tenant", () => ({
  resolveAppProjectIdForRequest,
}));

vi.mock("@/lib/templates/local-v0-template-source", () => ({
  getLocalV0TemplateSourceById,
  loadLocalV0TemplateFiles,
}));

vi.mock("@/lib/gen/preview/preview-session", () => ({
  startPreviewSession,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  createChat: chatRepoCreateChat,
  addMessage: chatRepoAddMessage,
  createDraftVersion: chatRepoCreateDraftVersion,
  updateVersionPreviewUrl: chatRepoUpdateVersionPreviewUrl,
  getChat: chatRepoGetChat,
  listChatsByProject: chatRepoListChatsByProject,
  getPreferredVersion: chatRepoGetPreferredVersion,
  getLatestVersion: chatRepoGetLatestVersion,
  getChatOrchestrationSnapshot: chatRepoGetChatOrchestrationSnapshot,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/logging/dev-log", () => ({
  devLogAppend,
}));

vi.mock("@/lib/templates/imported-repo-initialization", () => ({
  persistImportedRepoInitialization,
  recordImportedRepoPreviewOutcome,
}));

vi.mock("@/lib/templates/template-init-claim", () => {
  function claimKeyOf(input: {
    projectId?: string | null;
    templateId: string;
    userId?: string | null;
    sessionId?: string | null;
  }) {
    const projectId = input.projectId?.trim();
    if (projectId) return `project:${projectId}:${input.templateId}`;
    const userId = input.userId?.trim();
    if (userId) return `owner:user:${userId}:${input.templateId}`;
    const sessionId = input.sessionId?.trim() || "sess_1";
    return `owner:session:${sessionId}:${input.templateId}`;
  }

  return {
    buildTemplateInitClaimKey: claimKeyOf,
    claimTemplateInit: async (input: {
      projectId?: string | null;
      templateId: string;
      userId?: string | null;
      sessionId?: string | null;
    }) => {
      const claimKey = claimKeyOf(input);
      const existing = claimState.store.get(claimKey);
      if (existing?.status === "completed") {
        return { kind: "completed", ...existing };
      }
      if (existing?.status === "pending" && existing.chatId && existing.versionId) {
        return { kind: "imported", ...existing };
      }
      if (existing?.status === "pending") {
        return { kind: "busy", ...existing };
      }
      if (existing?.status === "failed") {
        existing.status = "pending";
        existing.claimGeneration += 1;
        return { kind: "acquired", ...existing };
      }
      claimState.seq += 1;
      const row = {
        claimKey,
        operationId: `op_${claimState.seq}`,
        status: "pending" as const,
        claimGeneration: 1,
        projectId: input.projectId?.trim() || null,
        chatId: null,
        versionId: null,
      };
      claimState.store.set(claimKey, row);
      return { kind: "acquired", ...row };
    },
    bindTemplateInitProject: async (input: {
      claimKey: string;
      operationId: string;
      claimGeneration: number;
      projectId: string;
    }) => {
      const row = claimState.store.get(input.claimKey);
      if (
        !row ||
        row.operationId !== input.operationId ||
        row.claimGeneration !== input.claimGeneration ||
        row.status !== "pending"
      ) {
        return false;
      }
      if (!claimState.bindResult) return false;
      row.projectId = input.projectId;
      return true;
    },
    recordTemplateInitImport: async (input: {
      claimKey: string;
      operationId: string;
      claimGeneration: number;
      projectId: string;
      chatId: string;
      versionId: string;
    }) => {
      const row = claimState.store.get(input.claimKey);
      if (
        !row ||
        row.operationId !== input.operationId ||
        row.claimGeneration !== input.claimGeneration ||
        row.status !== "pending"
      ) {
        return false;
      }
      if (!claimState.recordResult) return false;
      row.projectId = input.projectId;
      row.chatId = input.chatId;
      row.versionId = input.versionId;
      return true;
    },
    completeTemplateInitClaim: async (input: {
      claimKey: string;
      operationId: string;
      claimGeneration: number;
      projectId: string;
      chatId: string;
      versionId: string;
    }) => {
      const row = claimState.store.get(input.claimKey);
      if (
        !row ||
        row.operationId !== input.operationId ||
        row.claimGeneration !== input.claimGeneration ||
        row.status !== "pending"
      ) {
        return false;
      }
      if (!claimState.completeResult) return false;
      row.status = "completed";
      row.projectId = input.projectId;
      row.chatId = input.chatId;
      row.versionId = input.versionId;
      return true;
    },
    failTemplateInitClaim: async (input: {
      claimKey: string;
      operationId: string;
      claimGeneration: number;
      projectId?: string | null;
    }) => {
      const row = claimState.store.get(input.claimKey);
      if (
        !row ||
        row.operationId !== input.operationId ||
        row.claimGeneration !== input.claimGeneration ||
        row.status !== "pending"
      ) {
        return false;
      }
      const boundProjectId = input.projectId?.trim();
      if (boundProjectId) row.projectId = boundProjectId;
      row.status = "failed";
      return true;
    },
  };
});

vi.mock("@/lib/templates/template-data", () => ({
  getTemplateById: (id: string) =>
    id === "tmpl_1"
      ? {
          id: "tmpl_1",
          title: "Nordic Studio",
          slug: "nordic-studio",
          imageFilename: "nordic-studio.png",
          previewImageUrl: "https://example.com/preview.png",
          category: "website-templates",
        }
      : undefined,
  getTemplateCategoryId: () => "website-templates",
  getTemplateCategoryTitle: () => "Webbplatsmallar",
}));

vi.mock("@/lib/templates/template-catalog", () => ({
  getTemplateCatalogItemById: () => ({
    id: "tmpl_1",
    title: "Nordic Studio",
    category: "Webbplatsmallar",
    previewImageUrl: "https://example.com/preview.png",
    source: "v0",
    buildIntent: "template",
  }),
}));

import { POST } from "./route";

describe("POST /api/template", () => {
  const freshTimestamp = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    createProject.mockReset();
    saveProjectData.mockReset();
    getProjectData.mockReset();
    findLatestTemplateInitProjectIdForOwner.mockReset();
    getCurrentUser.mockReset();
    prepareCredits.mockReset();
    commitCredits.mockReset();
    resolveAppProjectIdForRequest.mockReset();
    getLocalV0TemplateSourceById.mockReset();
    loadLocalV0TemplateFiles.mockReset();
    startPreviewSession.mockReset();
    chatRepoCreateChat.mockReset();
    chatRepoAddMessage.mockReset();
    chatRepoCreateDraftVersion.mockReset();
    chatRepoUpdateVersionPreviewUrl.mockReset();
    chatRepoGetChat.mockReset();
    chatRepoListChatsByProject.mockReset();
    chatRepoGetPreferredVersion.mockReset();
    chatRepoGetLatestVersion.mockReset();
    chatRepoGetChatOrchestrationSnapshot.mockReset();
    devLogAppend.mockReset();
    persistImportedRepoInitialization.mockReset();
    recordImportedRepoPreviewOutcome.mockReset();
    claimState.store.clear();
    claimState.seq = 0;
    claimState.bindResult = true;
    claimState.recordResult = true;
    claimState.completeResult = true;

    getCurrentUser.mockResolvedValue(null);
    resolveAppProjectIdForRequest.mockResolvedValue(null);
    getLocalV0TemplateSourceById.mockResolvedValue(null);
    loadLocalV0TemplateFiles.mockResolvedValue(null);
    startPreviewSession.mockResolvedValue({
      ok: true,
      result: {
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_import",
        previewSessionId: "ps_1",
        previewMode: "dev_only",
        fidelityTier: 2,
        startOutcome: "recreated",
        runtimeReady: false,
        filesRevision: "revision_import",
      },
    });
    chatRepoCreateChat.mockResolvedValue({ id: "chat_import" });
    chatRepoAddMessage.mockResolvedValue({ id: "msg_import" });
    chatRepoCreateDraftVersion.mockResolvedValue({
      id: "ver_import",
      files_revision: "revision_import",
    });
    chatRepoUpdateVersionPreviewUrl.mockResolvedValue(true);
    chatRepoGetChat.mockResolvedValue({ messages: [] });
    chatRepoListChatsByProject.mockResolvedValue([]);
    chatRepoGetPreferredVersion.mockResolvedValue(null);
    chatRepoGetLatestVersion.mockResolvedValue(null);
    chatRepoGetChatOrchestrationSnapshot.mockResolvedValue(null);
    getProjectData.mockResolvedValue(null);
    findLatestTemplateInitProjectIdForOwner.mockResolvedValue(null);
    prepareCredits.mockResolvedValue({ ok: true, commit: commitCredits });
    createProject.mockResolvedValue({ id: "proj_new" });
    persistImportedRepoInitialization.mockResolvedValue({
      snapshotPersisted: true,
      telemetryPersisted: true,
    });
    recordImportedRepoPreviewOutcome.mockResolvedValue(false);
  });

  it("rejects v0 templates that are not available as local repo zips", async () => {
    const response = await POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "tmpl_1", quality: "standard" }),
      }) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({
      success: false,
      reason: "local_template_source_missing",
      templateId: "tmpl_1",
      recoverable: true,
      error:
        "Den här v0-templaten finns varken lokalt eller i Blob-manifestet och kan därför inte startas som repo i VM-previewn.",
    });
    expect(loadLocalV0TemplateFiles).not.toHaveBeenCalled();
    expect(commitCredits).not.toHaveBeenCalled();
  });

  it("imports local repo-backed v0 templates into own-engine", async () => {
    const sourceTimestamp = freshTimestamp();
    getLocalV0TemplateSourceById.mockResolvedValue({
      templateId: "tmpl_1",
      archivePath: "C:\\templates_v0\\downloads\\AI\\tmpl_1\\repo.zip",
      sourceSlugs: ["ai"],
      sourceLabelsSv: ["AI"],
      categoryLabel: "AI",
      timestamp: sourceTimestamp,
      archiveSha256: "b".repeat(64),
    });
    loadLocalV0TemplateFiles.mockResolvedValue({
      source: {
        templateId: "tmpl_1",
        archivePath: "C:\\templates_v0\\downloads\\AI\\tmpl_1\\repo.zip",
        sourceSlugs: ["ai"],
        sourceLabelsSv: ["AI"],
        categoryLabel: "AI",
        timestamp: sourceTimestamp,
        archiveSha256: "a".repeat(64),
      },
      files: [
        {
          path: "app/page.tsx",
          content: "export default function Page() { return <div>Repo</div>; }",
          language: "tsx",
        },
        {
          path: "package.json",
          content: '{"name":"repo-template","scripts":{"dev":"next dev"}}',
          language: "json",
        },
        {
          path: "pnpm-lock.yaml",
          content: "lockfileVersion: '9.0'",
          language: "yaml",
        },
      ],
    });

    const response = await POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "tmpl_1", quality: "standard" }),
      }) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      cached: false,
      chatId: "chat_import",
      projectId: "proj_new",
      versionId: "ver_import",
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_import",
      source: {
        templateId: "tmpl_1",
        timestamp: sourceTimestamp,
        stale: false,
        sourceSlugs: ["ai"],
        categoryLabel: "AI",
      },
    });
    expect(typeof json.source.ageSeconds).toBe("number");
    expect(json.source.ageSeconds).toBeGreaterThanOrEqual(0);
    expect(json).not.toHaveProperty("previewStartFailed");
    expect(json).not.toHaveProperty("previewStartError");
    expect(devLogAppend).not.toHaveBeenCalled();
    expect(chatRepoCreateDraftVersion).toHaveBeenCalledWith(
      "chat_import",
      "msg_import",
      expect.stringContaining('"path":"pnpm-lock.yaml"'),
      undefined,
      { editKind: "imported_repo" },
    );
    expect(startPreviewSession).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ path: "app/page.tsx" }),
        expect.objectContaining({ path: "pnpm-lock.yaml" }),
      ]),
      expect.objectContaining({
        chatId: "chat_import",
        appProjectId: "proj_new",
        versionIdForSession: "ver_import",
        skipRepair: true,
        skipProjectScaffold: true,
      }),
    );
    expect(persistImportedRepoInitialization).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_import",
        versionId: "ver_import",
        filesRevision: "revision_import",
        origin: expect.objectContaining({
          kind: "v0_template",
          templateId: "tmpl_1",
          archiveSha256: "a".repeat(64),
        }),
        baseline: expect.objectContaining({
          versionId: "ver_import",
          filesRevision: "revision_import",
          contract: expect.objectContaining({
            origin: expect.objectContaining({ archiveSha256: "a".repeat(64) }),
          }),
        }),
      }),
    );
    expect(persistImportedRepoInitialization.mock.invocationCallOrder[0]).toBeLessThan(
      startPreviewSession.mock.invocationCallOrder[0],
    );
    expect(recordImportedRepoPreviewOutcome).toHaveBeenCalledWith({
      versionId: "ver_import",
      filesRevision: "revision_import",
      outcome: "pending",
    });
    expect(chatRepoUpdateVersionPreviewUrl).toHaveBeenCalledWith(
      "ver_import",
      "https://vm-fly-jakem.fly.dev/chat_import",
    );
    expect(saveProjectData).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj_new",
        chat_id: "chat_import",
        demo_url: "https://vm-fly-jakem.fly.dev/chat_import",
        meta_patch: expect.objectContaining({
          source: "template-init:local-v0-import",
          templateId: "tmpl_1",
        }),
      }),
    );
    expect(commitCredits).toHaveBeenCalled();
  });

  it("succeeds with previewUrl: null and a previewStartFailed advisory when preview-host is unavailable", async () => {
    getLocalV0TemplateSourceById.mockResolvedValue({
      templateId: "tmpl_1",
      archivePath: "C:\\templates_v0\\downloads\\AI\\tmpl_1\\repo.zip",
      sourceSlugs: ["ai"],
      sourceLabelsSv: ["AI"],
      categoryLabel: "AI",
      timestamp: "2026-04-05T12:00:00Z",
    });
    loadLocalV0TemplateFiles.mockResolvedValue({
      source: {
        templateId: "tmpl_1",
        archivePath: "C:\\templates_v0\\downloads\\AI\\tmpl_1\\repo.zip",
        sourceSlugs: ["ai"],
        sourceLabelsSv: ["AI"],
        categoryLabel: "AI",
        timestamp: "2026-04-05T12:00:00Z",
      },
      files: [
        {
          path: "app/page.tsx",
          content: "export default function Page() { return <div>Repo</div>; }",
          language: "tsx",
        },
      ],
    });
    startPreviewSession.mockResolvedValue({
      ok: false,
      error: {
        stage: "preview-start",
        message: "SAJTMASKIN_PREVIEW_HOST_BASE_URL must be set for tier-2 live preview.",
      },
    });

    const response = await POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "tmpl_1", quality: "standard" }),
      }) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      chatId: "chat_import",
      projectId: "proj_new",
      versionId: "ver_import",
      previewUrl: null,
      previewStartFailed: true,
    });
    expect(typeof json.previewStartError).toBe("string");
    expect(json.previewStartError.length).toBeGreaterThan(0);
    // Vendor-neutral user-facing copy: never leak host/provider names.
    expect(json.previewStartError).not.toMatch(/fly|vercel/i);
    expect(chatRepoCreateDraftVersion).toHaveBeenCalled();
    expect(chatRepoUpdateVersionPreviewUrl).not.toHaveBeenCalled();
    expect(recordImportedRepoPreviewOutcome).toHaveBeenCalledWith({
      versionId: "ver_import",
      filesRevision: null,
      outcome: "failed",
    });
    expect(commitCredits).toHaveBeenCalled();
  });

  it("treats an ok preview response without a usable URL as a failed preview", async () => {
    const source = {
      templateId: "tmpl_1",
      archivePath: "C:\\templates_v0\\downloads\\AI\\tmpl_1\\repo.zip",
      sourceSlugs: ["ai"],
      sourceLabelsSv: ["AI"],
      categoryLabel: "AI",
      timestamp: freshTimestamp(),
    };
    getLocalV0TemplateSourceById.mockResolvedValue(source);
    loadLocalV0TemplateFiles.mockResolvedValue({
      source,
      files: [
        {
          path: "app/page.tsx",
          content: "export default function Page() { return <div>Repo</div>; }",
          language: "tsx",
        },
      ],
    });
    startPreviewSession.mockResolvedValue({
      ok: true,
      result: {
        previewUrl: "   ",
        runtimeReady: true,
        filesRevision: "booted_revision",
      },
    });

    const response = await POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "tmpl_1", quality: "standard" }),
      }) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      previewUrl: null,
      previewStartFailed: true,
    });
    expect(chatRepoUpdateVersionPreviewUrl).not.toHaveBeenCalled();
    expect(recordImportedRepoPreviewOutcome).toHaveBeenCalledWith({
      versionId: "ver_import",
      filesRevision: null,
      outcome: "failed",
    });
  });

  it("surfaces stale=true and emits a devLog entry when the local source is older than 30 days", async () => {
    const staleTimestamp = "2025-01-01T00:00:00Z";
    getLocalV0TemplateSourceById.mockResolvedValue({
      templateId: "tmpl_1",
      archivePath: "C:\\templates_v0\\downloads\\AI\\tmpl_1\\repo.zip",
      sourceSlugs: ["ai"],
      sourceLabelsSv: ["AI"],
      categoryLabel: "AI",
      timestamp: staleTimestamp,
    });
    loadLocalV0TemplateFiles.mockResolvedValue({
      source: {
        templateId: "tmpl_1",
        archivePath: "C:\\templates_v0\\downloads\\AI\\tmpl_1\\repo.zip",
        sourceSlugs: ["ai"],
        sourceLabelsSv: ["AI"],
        categoryLabel: "AI",
        timestamp: staleTimestamp,
      },
      files: [
        {
          path: "app/page.tsx",
          content: "export default function Page() { return <div>Repo</div>; }",
          language: "tsx",
        },
      ],
    });

    const response = await POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "tmpl_1", quality: "standard" }),
      }) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.source).toMatchObject({
      templateId: "tmpl_1",
      timestamp: staleTimestamp,
      stale: true,
    });
    expect(devLogAppend).toHaveBeenCalledWith(
      "latest",
      expect.objectContaining({
        type: "v0-import.stale-source",
        templateId: "tmpl_1",
        timestamp: staleTimestamp,
      }),
    );
  });

  it("returns ageSeconds=null and stale=false when the source timestamp is missing", async () => {
    getLocalV0TemplateSourceById.mockResolvedValue({
      templateId: "tmpl_1",
      archivePath: "C:\\templates_v0\\downloads\\AI\\tmpl_1\\repo.zip",
      sourceSlugs: [],
      sourceLabelsSv: [],
      categoryLabel: null,
      timestamp: null,
    });
    loadLocalV0TemplateFiles.mockResolvedValue({
      source: {
        templateId: "tmpl_1",
        archivePath: "C:\\templates_v0\\downloads\\AI\\tmpl_1\\repo.zip",
        sourceSlugs: [],
        sourceLabelsSv: [],
        categoryLabel: null,
        timestamp: null,
      },
      files: [
        {
          path: "app/page.tsx",
          content: "export default function Page() { return <div>Repo</div>; }",
          language: "tsx",
        },
      ],
    });

    const response = await POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "tmpl_1", quality: "standard" }),
      }) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.source).toEqual({
      templateId: "tmpl_1",
      sourceKind: "local",
      timestamp: null,
      ageSeconds: null,
      stale: false,
      sourceSlugs: [],
      categoryLabel: null,
      archiveUrl: null,
    });
    expect(devLogAppend).not.toHaveBeenCalled();
  });

  function stubLocalTemplateSource() {
    const source = {
      templateId: "tmpl_1",
      archivePath: "C:\\templates_v0\\downloads\\AI\\tmpl_1\\repo.zip",
      sourceSlugs: ["ai"],
      sourceLabelsSv: ["AI"],
      categoryLabel: "AI",
      timestamp: freshTimestamp(),
      archiveSha256: "a".repeat(64),
    };
    getLocalV0TemplateSourceById.mockResolvedValue(source);
    loadLocalV0TemplateFiles.mockResolvedValue({
      source,
      files: [
        {
          path: "app/page.tsx",
          content: "export default function Page() { return <div>Repo</div>; }",
          language: "tsx",
        },
      ],
    });
  }

  it("replays the same projectId+templateId without creating a second chat or charging again", async () => {
    stubLocalTemplateSource();
    resolveAppProjectIdForRequest.mockResolvedValue("proj_existing");
    chatRepoListChatsByProject.mockResolvedValue([
      {
        id: "chat_existing",
        model: "gpt-existing",
        orchestration_snapshot: {
          importedRepoBaseline: {
            contract: { origin: { kind: "v0_template", templateId: "tmpl_1" } },
          },
        },
      },
    ]);
    chatRepoGetPreferredVersion.mockResolvedValue({
      id: "ver_existing",
      files_json: JSON.stringify([
        { path: "app/page.tsx", content: "export default function Page() { return <div>Repo</div>; }" },
      ]),
      preview_url: "https://preview.example/chat_existing",
    });

    const body = JSON.stringify({
      templateId: "tmpl_1",
      quality: "standard",
      projectId: "proj_existing",
    });
    const first = await POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }) as never,
    );
    const second = await POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: "tmpl_1",
          quality: "standard",
          projectId: "proj_existing",
        }),
      }) as never,
    );
    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstJson).toMatchObject({
      success: true,
      cached: true,
      chatId: "chat_existing",
      projectId: "proj_existing",
      versionId: "ver_existing",
    });
    expect(secondJson).toMatchObject({
      success: true,
      cached: true,
      chatId: "chat_existing",
      projectId: "proj_existing",
    });
    expect(createProject).not.toHaveBeenCalled();
    expect(chatRepoCreateChat).not.toHaveBeenCalled();
    expect(prepareCredits).not.toHaveBeenCalled();
    expect(commitCredits).not.toHaveBeenCalled();
  });

  it("reuses the owner+templateId project when the client omitted projectId", async () => {
    stubLocalTemplateSource();
    findLatestTemplateInitProjectIdForOwner.mockResolvedValue("proj_reused");
    chatRepoListChatsByProject.mockResolvedValue([
      {
        id: "chat_reused",
        model: "gpt-reused",
        orchestration_snapshot: {
          importedRepoBaseline: {
            contract: { origin: { templateId: "tmpl_1" } },
          },
        },
      },
    ]);
    chatRepoGetPreferredVersion.mockResolvedValue({
      id: "ver_reused",
      files_json: JSON.stringify([{ path: "app/page.tsx", content: "const reused = true;" }]),
      preview_url: null,
    });

    const first = await POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "tmpl_1", quality: "standard" }),
      }) as never,
    );
    const second = await POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "tmpl_1", quality: "standard" }),
      }) as never,
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await first.json()).chatId).toBe("chat_reused");
    expect((await second.json()).chatId).toBe("chat_reused");
    expect(createProject).not.toHaveBeenCalled();
    expect(chatRepoCreateChat).not.toHaveBeenCalled();
    expect(findLatestTemplateInitProjectIdForOwner).toHaveBeenCalledWith(
      { userId: null, sessionId: "sess_1" },
      "tmpl_1",
    );
  });

  it("creates only one project+chat across two cold inits of the same templateId", async () => {
    stubLocalTemplateSource();
    findLatestTemplateInitProjectIdForOwner
      .mockResolvedValueOnce(null)
      .mockResolvedValue("proj_new");
    // First POST has no projectId yet, so it never lists chats. The retry
    // looks up the pending project and must see the chat created by init.
    chatRepoListChatsByProject.mockResolvedValue([
      {
        id: "chat_import",
        model: "gpt-import",
        orchestration_snapshot: {
          importedRepoBaseline: {
            contract: { origin: { templateId: "tmpl_1" } },
          },
        },
      },
    ]);
    chatRepoGetPreferredVersion.mockResolvedValue({
      id: "ver_import",
      files_json: JSON.stringify([
        { path: "app/page.tsx", content: "export default function Page() { return <div>Repo</div>; }" },
      ]),
      preview_url: "[REDACTED]/chat_import",
    });

    const first = await POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "tmpl_1", quality: "standard" }),
      }) as never,
    );
    const second = await POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "tmpl_1", quality: "standard" }),
      }) as never,
    );
    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstJson.cached).toBe(false);
    expect(secondJson).toMatchObject({
      cached: true,
      chatId: "chat_import",
      projectId: "proj_new",
    });
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(chatRepoCreateChat).toHaveBeenCalledTimes(1);
    expect(prepareCredits.mock.calls.map((call) => call[3]?.idempotencyKey)).toEqual([
      "op_1",
      "op_1",
    ]);
  });

  async function postTemplate(body: Record<string, unknown>) {
    return POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }) as never,
    );
  }

  it("imports and charges at most once when two explicit-project inits race", async () => {
    stubLocalTemplateSource();
    resolveAppProjectIdForRequest.mockResolvedValue("proj_existing");
    let releaseFirstCreate: (() => void) | undefined;
    const firstCreateStarted = new Promise<void>((resolve) => {
      releaseFirstCreate = resolve;
    });
    let releaseFirstHold: (() => void) | undefined;
    const firstCreateHold = new Promise<void>((resolve) => {
      releaseFirstHold = resolve;
    });
    let creates = 0;
    chatRepoCreateChat.mockImplementation(async () => {
      creates += 1;
      if (creates === 1) {
        releaseFirstCreate?.();
        await firstCreateHold;
      }
      return { id: `chat_race_${creates}` };
    });

    const pending = postTemplate({
      templateId: "tmpl_1",
      quality: "standard",
      projectId: "proj_existing",
    });
    await firstCreateStarted;
    const lostRetry = await postTemplate({
      templateId: "tmpl_1",
      quality: "standard",
      projectId: "proj_existing",
    });

    expect(lostRetry.status).toBeGreaterThanOrEqual(400);
    expect(chatRepoCreateChat).toHaveBeenCalledTimes(1);
    expect(commitCredits).not.toHaveBeenCalled();
    releaseFirstHold?.();
    await pending;
    expect(chatRepoCreateChat).toHaveBeenCalledTimes(1);
    expect(commitCredits).toHaveBeenCalledTimes(1);
  });

  it("imports and charges at most once when two no-project inits race", async () => {
    stubLocalTemplateSource();
    findLatestTemplateInitProjectIdForOwner.mockResolvedValue(null);
    let releaseFirstCreate: (() => void) | undefined;
    const firstCreateStarted = new Promise<void>((resolve) => {
      releaseFirstCreate = resolve;
    });
    let releaseFirstHold: (() => void) | undefined;
    const firstCreateHold = new Promise<void>((resolve) => {
      releaseFirstHold = resolve;
    });
    let creates = 0;
    chatRepoCreateChat.mockImplementation(async () => {
      creates += 1;
      if (creates === 1) {
        releaseFirstCreate?.();
        await firstCreateHold;
      }
      return { id: `chat_owner_${creates}` };
    });

    const pending = postTemplate({ templateId: "tmpl_1", quality: "standard" });
    await firstCreateStarted;
    const lostRetry = await postTemplate({ templateId: "tmpl_1", quality: "standard" });

    expect(lostRetry.status).toBeGreaterThanOrEqual(400);
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(chatRepoCreateChat).toHaveBeenCalledTimes(1);
    expect(commitCredits).not.toHaveBeenCalled();
    releaseFirstHold?.();
    await pending;
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(chatRepoCreateChat).toHaveBeenCalledTimes(1);
    expect(commitCredits).toHaveBeenCalledTimes(1);
  });

  it("still allows two different new projects with the same template", async () => {
    stubLocalTemplateSource();
    resolveAppProjectIdForRequest
      .mockResolvedValueOnce("proj_a")
      .mockResolvedValueOnce("proj_b");
    chatRepoCreateChat
      .mockResolvedValueOnce({ id: "chat_a" })
      .mockResolvedValueOnce({ id: "chat_b" });

    const first = await postTemplate({
      templateId: "tmpl_1",
      quality: "standard",
      projectId: "proj_a",
    });
    const second = await postTemplate({
      templateId: "tmpl_1",
      quality: "standard",
      projectId: "proj_b",
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await first.json()).chatId).toBe("chat_a");
    expect((await second.json()).chatId).toBe("chat_b");
    expect(chatRepoCreateChat).toHaveBeenCalledTimes(2);
    expect(commitCredits).toHaveBeenCalledTimes(2);
    expect(prepareCredits.mock.calls.map((call) => call[3]?.idempotencyKey)).toEqual([
      expect.stringMatching(/\S/),
      expect.stringMatching(/\S/),
    ]);
    expect(prepareCredits.mock.calls[0][3]?.idempotencyKey).not.toBe(
      prepareCredits.mock.calls[1][3]?.idempotencyKey,
    );
  });

  it("does not create or charge when both version reads fail", async () => {
    stubLocalTemplateSource();
    resolveAppProjectIdForRequest.mockResolvedValue("proj_existing");
    chatRepoListChatsByProject.mockResolvedValue([
      {
        id: "chat_existing",
        model: "gpt-existing",
        orchestration_snapshot: {
          importedRepoBaseline: {
            contract: { origin: { kind: "v0_template", templateId: "tmpl_1" } },
          },
        },
      },
    ]);
    chatRepoGetPreferredVersion.mockRejectedValue(new Error("preferred down"));
    chatRepoGetLatestVersion.mockRejectedValue(new Error("latest down"));

    const response = await postTemplate({
      templateId: "tmpl_1",
      quality: "standard",
      projectId: "proj_existing",
    });
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toMatchObject({
      success: false,
      retryable: true,
    });
    expect(chatRepoCreateChat).not.toHaveBeenCalled();
    expect(prepareCredits).not.toHaveBeenCalled();
    expect(commitCredits).not.toHaveBeenCalled();
  });

  it("retries a failed credit-commit on the same operation without a second import", async () => {
    stubLocalTemplateSource();
    findLatestTemplateInitProjectIdForOwner
      .mockResolvedValueOnce(null)
      .mockResolvedValue("proj_new");
    chatRepoGetChat.mockResolvedValue({
      id: "chat_import",
      project_id: "proj_new",
      model: "gpt-import",
      messages: [],
    });
    chatRepoListChatsByProject.mockResolvedValue([
      {
        id: "chat_import",
        model: "gpt-import",
        orchestration_snapshot: {
          importedRepoBaseline: {
            contract: { origin: { templateId: "tmpl_1" } },
          },
        },
      },
    ]);
    chatRepoGetPreferredVersion.mockResolvedValue({
      id: "ver_import",
      files_json: JSON.stringify([
        { path: "app/page.tsx", content: "export default function Page() { return <div>Repo</div>; }" },
      ]),
      preview_url: "https://vm-fly-jakem.fly.dev/chat_import",
    });
    commitCredits.mockRejectedValueOnce(new Error("ledger down")).mockResolvedValue(undefined);

    const first = await postTemplate({ templateId: "tmpl_1", quality: "standard" });
    const second = await postTemplate({ templateId: "tmpl_1", quality: "standard" });
    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(first.status).toBe(503);
    expect(firstJson).toMatchObject({ success: false, retryable: true });
    expect(second.status).toBe(200);
    expect(secondJson).toMatchObject({
      success: true,
      cached: true,
      chatId: "chat_import",
      projectId: "proj_new",
      versionId: "ver_import",
    });
    expect(chatRepoCreateChat).toHaveBeenCalledTimes(1);
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(commitCredits).toHaveBeenCalledTimes(2);
    expect(prepareCredits.mock.calls.map((call) => call[3]?.idempotencyKey)).toEqual([
      "op_1",
      "op_1",
    ]);
  });

  it("releases the reservation when prepareCredits throws so the next attempt is not busy", async () => {
    stubLocalTemplateSource();
    prepareCredits.mockRejectedValueOnce(new Error("credits lookup down"));

    const first = await postTemplate({ templateId: "tmpl_1", quality: "standard" });
    const second = await postTemplate({ templateId: "tmpl_1", quality: "standard" });

    expect(first.status).toBe(500);
    expect(second.status).toBe(200);
    expect((await second.json()).chatId).toBe("chat_import");
    expect(chatRepoCreateChat).toHaveBeenCalledTimes(1);
    expect(commitCredits).toHaveBeenCalledTimes(1);
  });

  it("does not import when bindTemplateInitProject rejects the write", async () => {
    stubLocalTemplateSource();
    claimState.bindResult = false;

    const response = await postTemplate({ templateId: "tmpl_1", quality: "standard" });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({ success: false, retryable: true });
    expect(chatRepoCreateChat).not.toHaveBeenCalled();
    expect(commitCredits).not.toHaveBeenCalled();
  });

  it("keeps one operation and does not import or charge twice after a cold-start persist", async () => {
    stubLocalTemplateSource();
    findLatestTemplateInitProjectIdForOwner
      .mockResolvedValueOnce(null)
      .mockResolvedValue("proj_new");
    chatRepoGetChat.mockResolvedValue({
      id: "chat_import",
      project_id: "proj_new",
      model: "gpt-import",
      messages: [],
    });
    chatRepoGetPreferredVersion.mockResolvedValue({
      id: "ver_import",
      files_json: JSON.stringify([
        { path: "app/page.tsx", content: "export default function Page() { return <div>Repo</div>; }" },
      ]),
      preview_url: "https://vm-fly-jakem.fly.dev/chat_import",
    });

    const first = await postTemplate({ templateId: "tmpl_1", quality: "standard" });
    const second = await postTemplate({ templateId: "tmpl_1", quality: "standard" });
    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstJson.cached).toBe(false);
    expect(secondJson).toMatchObject({
      cached: true,
      chatId: "chat_import",
      projectId: "proj_new",
      versionId: "ver_import",
    });
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(chatRepoCreateChat).toHaveBeenCalledTimes(1);
    expect(claimState.store.size).toBe(1);
    expect([...claimState.store.values()].map((row) => row.operationId)).toEqual(["op_1"]);
    expect(prepareCredits.mock.calls.map((call) => call[3]?.idempotencyKey)).toEqual([
      "op_1",
      "op_1",
    ]);
  });

  it("does not return a free import after record_failed when persist already exists", async () => {
    stubLocalTemplateSource();
    resolveAppProjectIdForRequest.mockResolvedValue("proj_existing");
    claimState.recordResult = false;
    chatRepoGetChat.mockResolvedValue({
      id: "chat_import",
      project_id: "proj_existing",
      model: "gpt-import",
      messages: [],
    });
    chatRepoGetPreferredVersion.mockResolvedValue({
      id: "ver_import",
      files_json: JSON.stringify([
        { path: "app/page.tsx", content: "export default function Page() { return <div>Repo</div>; }" },
      ]),
      preview_url: "https://vm-fly-jakem.fly.dev/chat_import",
    });

    const first = await postTemplate({
      templateId: "tmpl_1",
      quality: "standard",
      projectId: "proj_existing",
    });

    chatRepoListChatsByProject.mockResolvedValue([
      {
        id: "chat_import",
        model: "gpt-import",
        orchestration_snapshot: {
          importedRepoBaseline: {
            contract: { origin: { templateId: "tmpl_1" } },
          },
        },
      },
    ]);

    const second = await postTemplate({
      templateId: "tmpl_1",
      quality: "standard",
      projectId: "proj_existing",
    });
    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(first.status).toBe(200);
    expect(firstJson).toMatchObject({
      success: true,
      chatId: "chat_import",
      projectId: "proj_existing",
    });
    expect(second.status).toBe(200);
    expect(secondJson).toMatchObject({
      success: true,
      cached: true,
      chatId: "chat_import",
      projectId: "proj_existing",
    });
    expect(chatRepoCreateChat).toHaveBeenCalledTimes(1);
    expect(commitCredits).toHaveBeenCalledTimes(2);
    expect(prepareCredits.mock.calls.map((call) => call[3]?.idempotencyKey)).toEqual([
      "op_1",
      "op_1",
      "op_1",
    ]);
  });

  it("reuses the minted project when bind fails and the next attempt succeeds", async () => {
    stubLocalTemplateSource();
    claimState.bindResult = false;

    const first = await postTemplate({ templateId: "tmpl_1", quality: "standard" });
    expect(first.status).toBe(409);
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(commitCredits).not.toHaveBeenCalled();

    claimState.bindResult = true;
    const second = await postTemplate({ templateId: "tmpl_1", quality: "standard" });
    expect(second.status).toBe(200);
    expect((await second.json()).projectId).toBe("proj_new");
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(chatRepoCreateChat).toHaveBeenCalledTimes(1);
    expect(commitCredits).toHaveBeenCalledTimes(1);
    expect(prepareCredits.mock.calls.map((call) => call[3]?.idempotencyKey)).toEqual([
      "op_1",
      "op_1",
    ]);
  });
});
