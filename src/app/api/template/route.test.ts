import { beforeEach, describe, expect, it, vi } from "vitest";

const getCachedTemplate = vi.hoisted(() => vi.fn());
const cacheTemplateResult = vi.hoisted(() => vi.fn());
const createProject = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const commitCredits = vi.hoisted(() => vi.fn());
const generateOwnEngineSiteFromPrompt = vi.hoisted(() => vi.fn());
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const resolveAppProjectIdForRequest = vi.hoisted(() => vi.fn());
const chatRepoGetChat = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services", () => ({
  getCachedTemplate,
  cacheTemplateResult,
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

vi.mock("@/lib/own-engine/generate-site-from-prompt", () => ({
  generateOwnEngineSiteFromPrompt,
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  resolveAppProjectIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
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
          viewUrl: "https://example.com/view",
          editUrl: "https://example.com/edit",
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
    getCachedTemplate.mockReset();
    cacheTemplateResult.mockReset();
    createProject.mockReset();
    saveProjectData.mockReset();
    getCurrentUser.mockReset();
    prepareCredits.mockReset();
    commitCredits.mockReset();
    generateOwnEngineSiteFromPrompt.mockReset();
    getEngineChatByIdForRequest.mockReset();
    resolveAppProjectIdForRequest.mockReset();
    chatRepoGetChat.mockReset();

    getCurrentUser.mockResolvedValue(null);
    resolveAppProjectIdForRequest.mockResolvedValue(null);
    chatRepoGetChat.mockResolvedValue({ messages: [] });
    prepareCredits.mockResolvedValue({ ok: true, commit: commitCredits });
    createProject.mockResolvedValue({ id: "proj_new" });
  });

  it("returns cached own-engine template results when cache points to an engine chat", async () => {
    getCachedTemplate.mockResolvedValue({
      chat_id: "chat_cached",
      demo_url: "/api/preview-render?chatId=chat_cached&versionId=ver_cached",
      version_id: "ver_cached",
      code: "export default function Page() { return <div>Cached</div>; }",
      files_json:
        '[{"name":"src/app/page.tsx","content":"export default function Page() { return <div>Cached</div>; }"}]',
      model: "gpt-5.4",
    });
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_cached",
      project_id: "proj_cached",
    });

    const response = await POST(
      new Request("https://example.com/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "tmpl_1" }),
      }) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      cached: true,
      chatId: "chat_cached",
      projectId: "proj_cached",
      model: "gpt-5.4",
    });
    expect(generateOwnEngineSiteFromPrompt).not.toHaveBeenCalled();
  });

  it("generates a fresh own-engine template result when cache is missing", async () => {
    getCachedTemplate.mockResolvedValue(null);
    generateOwnEngineSiteFromPrompt.mockResolvedValue({
      projectId: "proj_new",
      chatId: "chat_new",
      versionId: "ver_new",
      messageId: "msg_new",
      previewUrl: null,
      runtimeMode: "preview",
      runtimeUrl: "/api/preview-render?chatId=chat_new&versionId=ver_new&projectId=proj_new",
      scaffoldId: "landing-page",
      filesCount: 1,
      files: [
        {
          path: "src/app/page.tsx",
          content: "export default function Page() { return <div>Hej</div>; }",
        },
      ],
      contentForVersion: "export default function Page() { return <div>Hej</div>; }",
      model: "gpt-5.4",
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
      chatId: "chat_new",
      projectId: "proj_new",
      previewUrl: "/api/preview-render?chatId=chat_new&versionId=ver_new&projectId=proj_new",
      model: "gpt-5.4",
    });
    expect(generateOwnEngineSiteFromPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj_new",
        buildIntent: "template",
        modelId: "pro",
      }),
    );
    expect(cacheTemplateResult).toHaveBeenCalled();
    expect(commitCredits).toHaveBeenCalled();
  });
});
