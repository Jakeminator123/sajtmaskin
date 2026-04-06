import { beforeEach, describe, expect, it, vi } from "vitest";

const createProject = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/db/services/projects", () => ({
  createProject,
  saveProjectData,
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
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

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
  beforeEach(() => {
    createProject.mockReset();
    saveProjectData.mockReset();
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

    getCurrentUser.mockResolvedValue(null);
    resolveAppProjectIdForRequest.mockResolvedValue(null);
    getLocalV0TemplateSourceById.mockResolvedValue(null);
    loadLocalV0TemplateFiles.mockResolvedValue(null);
    startPreviewSession.mockResolvedValue({
      ok: true,
      result: {
        sandboxUrl: "https://vm-fly-jakem.fly.dev/chat_import",
        sandboxId: "sbx_1",
        sandboxPreviewMode: "dev_only",
        fidelityTier: 2,
        startOutcome: "recreated",
      },
    });
    chatRepoCreateChat.mockResolvedValue({ id: "chat_import" });
    chatRepoAddMessage.mockResolvedValue({ id: "msg_import" });
    chatRepoCreateDraftVersion.mockResolvedValue({ id: "ver_import" });
    chatRepoUpdateVersionPreviewUrl.mockResolvedValue(true);
    chatRepoGetChat.mockResolvedValue({ messages: [] });
    prepareCredits.mockResolvedValue({ ok: true, commit: commitCredits });
    createProject.mockResolvedValue({ id: "proj_new" });
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
    expect(json).toEqual({
      success: false,
      error:
        "Den här v0-mallen finns inte nedladdad lokalt ännu och kan därför inte startas som repo i VM-previewn.",
    });
    expect(loadLocalV0TemplateFiles).not.toHaveBeenCalled();
    expect(commitCredits).not.toHaveBeenCalled();
  });

  it("imports local repo-backed v0 templates into own-engine", async () => {
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
    });
    expect(chatRepoCreateDraftVersion).toHaveBeenCalledWith(
      "chat_import",
      "msg_import",
      expect.stringContaining('"path":"pnpm-lock.yaml"'),
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
      }),
    );
    expect(chatRepoUpdateVersionPreviewUrl).toHaveBeenCalledWith(
      "ver_import",
      "https://vm-fly-jakem.fly.dev/chat_import",
    );
    expect(saveProjectData).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj_new",
        chat_id: "chat_import",
        demo_url: "https://vm-fly-jakem.fly.dev/chat_import",
        meta: expect.objectContaining({
          source: "template-init:local-v0-import",
          templateId: "tmpl_1",
        }),
      }),
    );
    expect(commitCredits).toHaveBeenCalled();
  });
});
