import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const addDomainToProject = vi.hoisted(() => vi.fn());
const isVercelConfigured = vi.hoisted(() => vi.fn());
const addZoneRecord = vi.hoisted(() => vi.fn());
const isLoopiaConfigured = vi.hoisted(() => vi.fn());
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const getLatestVercelProjectIdForChat = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/vercel/vercel-client", () => ({
  addDomainToProject,
  isVercelConfigured,
}));

vi.mock("@/lib/loopia/loopia-client", () => ({
  addZoneRecord,
  isLoopiaConfigured,
}));

// Resolution dependencies (resolveVercelProjectForChat runs for real).
vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
}));

vi.mock("@/lib/db/services/projects", () => ({
  getProjectById,
}));

vi.mock("@/lib/deployment", () => ({
  getLatestVercelProjectIdForChat,
}));

const { POST } = await import("./route");

function linkRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/domains/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("POST /api/domains/link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    isVercelConfigured.mockReturnValue(true);
    isLoopiaConfigured.mockReturnValue(false);
    addDomainToProject.mockResolvedValue({ name: "site.example", verified: false });
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

  it("links the domain to the project's persisted Vercel project (app_projects)", async () => {
    const res = await POST(linkRequest({ domain: "site.example", chatId: "chat_1" }));

    expect(res.status).toBe(200);
    expect(addDomainToProject).toHaveBeenCalledWith(
      "vp_app",
      "site.example",
      process.env.VERCEL_TEAM_ID,
    );
    expect(getLatestVercelProjectIdForChat).not.toHaveBeenCalled();
  });

  it("falls back to the latest deployment's Vercel project when the app project has no link", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      vercel_project_id: null,
      vercel_project_name: null,
    });
    getLatestVercelProjectIdForChat.mockResolvedValue("vp_dep");

    const res = await POST(linkRequest({ domain: "site.example", chatId: "chat_1" }));

    expect(res.status).toBe(200);
    expect(addDomainToProject).toHaveBeenCalledWith(
      "vp_dep",
      "site.example",
      process.env.VERCEL_TEAM_ID,
    );
  });

  it("returns 409 when the site has not been published yet", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      vercel_project_id: null,
      vercel_project_name: null,
    });
    getLatestVercelProjectIdForChat.mockResolvedValue(null);

    const res = await POST(linkRequest({ domain: "site.example", chatId: "chat_1" }));

    expect(res.status).toBe(409);
    expect(addDomainToProject).not.toHaveBeenCalled();
  });

  it("returns 404 for a chat the caller does not own", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);

    const res = await POST(linkRequest({ domain: "site.example", chatId: "someone_elses_chat" }));

    expect(res.status).toBe(404);
    expect(addDomainToProject).not.toHaveBeenCalled();
  });
});
