import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getAppProjectByIdForRequest = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const getLatestVercelProjectIdForChat = vi.hoisted(() => vi.fn());
const getProjectSiteOverview = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getAppProjectByIdForRequest,
}));

vi.mock("@/lib/db/services/projects", () => ({
  getProjectById,
}));

vi.mock("@/lib/projects/site-overview", () => ({
  getProjectSiteOverview,
}));

vi.mock("@/lib/deployment", () => ({
  getLatestVercelProjectIdForChat,
}));

const { resolveVercelProjectForAppProject, resolveVercelProjectForChat } = await import(
  "./resolve-vercel-project"
);

function req() {
  return new Request("http://localhost/api/domains/link", { method: "POST" });
}

describe("resolveVercelProjectForChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: "proj_1",
      messages: [],
    });
    getProjectById.mockResolvedValue({
      id: "proj_1",
      vercel_project_id: "vp_app",
      vercel_project_name: "sajtmaskin-chat_1",
    });
    getLatestVercelProjectIdForChat.mockResolvedValue(null);
  });

  it("returns 404 for a missing/foreign chat (tenant-guarded, no leak)", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);

    const result = await resolveVercelProjectForChat(req(), "foreign_chat");

    expect(result).toEqual({ ok: false, status: 404, error: expect.any(String) });
    expect(getProjectById).not.toHaveBeenCalled();
    expect(getLatestVercelProjectIdForChat).not.toHaveBeenCalled();
  });

  // A#4: a stale persisted app_projects link must lose to the newest deployment.
  it("prefers the latest deployment over a stale app_projects link", async () => {
    getProjectById.mockResolvedValue({ id: "proj_1", vercel_project_id: "vp_stale" });
    getLatestVercelProjectIdForChat.mockResolvedValue("vp_fresh");

    const result = await resolveVercelProjectForChat(req(), "chat_1");

    expect(result).toEqual({
      ok: true,
      vercelProjectId: "vp_fresh",
      appProjectId: "proj_1",
      source: "deployment",
      chatId: "chat_1",
    });
  });

  it("uses the latest deployment when the app project has no persisted link", async () => {
    getProjectById.mockResolvedValue({ id: "proj_1", vercel_project_id: null });
    getLatestVercelProjectIdForChat.mockResolvedValue("vp_dep");

    const result = await resolveVercelProjectForChat(req(), "chat_1");

    expect(result).toEqual({
      ok: true,
      vercelProjectId: "vp_dep",
      appProjectId: "proj_1",
      source: "deployment",
      chatId: "chat_1",
    });
  });

  it("falls back to the persisted app_projects link when there is no deployment yet", async () => {
    getProjectById.mockResolvedValue({ id: "proj_1", vercel_project_id: "vp_app" });
    getLatestVercelProjectIdForChat.mockResolvedValue(null);

    const result = await resolveVercelProjectForChat(req(), "chat_1");

    expect(result).toEqual({
      ok: true,
      vercelProjectId: "vp_app",
      appProjectId: "proj_1",
      source: "app_project",
      chatId: "chat_1",
    });
  });

  it("returns 409 when neither a deployment nor a persisted link exists", async () => {
    getProjectById.mockResolvedValue({ id: "proj_1", vercel_project_id: null });
    getLatestVercelProjectIdForChat.mockResolvedValue(null);

    const result = await resolveVercelProjectForChat(req(), "chat_1");

    expect(result).toEqual({ ok: false, status: 409, error: expect.any(String) });
  });

  it("resolves from the deployment even when the chat has no project_id (fallback path)", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1", project_id: "", messages: [] });
    getLatestVercelProjectIdForChat.mockResolvedValue("vp_dep");

    const result = await resolveVercelProjectForChat(req(), "chat_1");

    expect(getProjectById).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      vercelProjectId: "vp_dep",
      appProjectId: null,
      source: "deployment",
      chatId: "chat_1",
    });
  });
});

describe("resolveVercelProjectForAppProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppProjectByIdForRequest.mockResolvedValue({
      id: "proj_1",
      vercel_project_id: "vp_app",
    });
    getProjectSiteOverview.mockResolvedValue({
      chatId: "chat_1",
      vercelProjectId: "vp_app",
    });
    getLatestVercelProjectIdForChat.mockResolvedValue("vp_fresh");
  });

  it("returns 404 for a project the caller does not own", async () => {
    getAppProjectByIdForRequest.mockResolvedValue(null);

    const result = await resolveVercelProjectForAppProject(req(), "foreign");

    expect(result).toEqual({ ok: false, status: 404, error: expect.any(String) });
    expect(getLatestVercelProjectIdForChat).not.toHaveBeenCalled();
  });

  it("prefers the latest deployment over a stale app_projects link", async () => {
    const result = await resolveVercelProjectForAppProject(req(), "proj_1");

    expect(result).toEqual({
      ok: true,
      vercelProjectId: "vp_fresh",
      appProjectId: "proj_1",
      source: "deployment",
      chatId: "chat_1",
    });
  });

  it("uses the site view's latest-ready chat, not an older chat with another Vercel id", async () => {
    getAppProjectByIdForRequest.mockResolvedValue({
      id: "proj_1",
      vercel_project_id: "vp_stale_cache",
    });
    getProjectSiteOverview.mockResolvedValue({
      chatId: "chat_ready",
      vercelProjectId: "vp_stale_cache",
    });
    getLatestVercelProjectIdForChat.mockImplementation(async (chatId: string) => {
      if (chatId === "chat_ready") return "vp_ready";
      if (chatId === "chat_old") return "vp_old";
      return null;
    });

    const result = await resolveVercelProjectForAppProject(req(), "proj_1");

    expect(result).toEqual({
      ok: true,
      vercelProjectId: "vp_ready",
      appProjectId: "proj_1",
      source: "deployment",
      chatId: "chat_ready",
    });
    expect(getProjectSiteOverview).toHaveBeenCalledWith("proj_1");
    expect(getLatestVercelProjectIdForChat).toHaveBeenCalledWith("chat_ready");
    expect(getLatestVercelProjectIdForChat).not.toHaveBeenCalledWith("chat_old");
  });
});
