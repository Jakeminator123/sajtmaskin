import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getVercelToken = vi.hoisted(() => vi.fn());
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const setProjectVerifiedCustomDomain = vi.hoisted(() => vi.fn());
const clearProjectCustomDomainVerification = vi.hoisted(() => vi.fn());
const checkVercelProjectDomain = vi.hoisted(() => vi.fn());
const getLatestVercelProjectIdForChat = vi.hoisted(() => vi.fn());
const setLatestDeploymentLiveUrlForChat = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/vercel", () => ({
  getVercelToken,
}));

// Resolution dependencies (resolveVercelProjectForChat runs for real).
vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
}));

vi.mock("@/lib/db/services/projects", () => ({
  clearProjectCustomDomainVerification,
  getProjectById,
  setProjectVerifiedCustomDomain,
}));
vi.mock("@/lib/vercelDeploy", () => ({
  checkVercelProjectDomain,
}));

vi.mock("@/lib/deployment", () => ({
  getLatestVercelProjectIdForChat,
  setLatestDeploymentLiveUrlForChat,
}));

const { POST } = await import("./route");

function verifyRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/domains/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("POST /api/domains/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getVercelToken.mockReturnValue("token");
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
    setProjectVerifiedCustomDomain.mockResolvedValue({ id: "proj_1" });
    checkVercelProjectDomain.mockResolvedValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ name: "site.example", verified: true })),
    );
  });

  it("does not promote provider ownership verification when DNS is misconfigured", async () => {
    checkVercelProjectDomain.mockResolvedValue(false);

    const res = await POST(verifyRequest({ domain: "site.example", chatId: "chat_1" }));

    expect(res.status).toBe(200);
    expect((await res.json()).verified).toBe(false);
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
    expect(clearProjectCustomDomainVerification).toHaveBeenCalledWith(
      "proj_1",
      "site.example",
    );
  });

  it("returns a tenant-safe conflict when the domain is already owned", async () => {
    setProjectVerifiedCustomDomain.mockRejectedValue(
      Object.assign(new Error("duplicate"), { code: "23505" }),
    );

    const res = await POST(
      verifyRequest({ domain: "site.example", chatId: "chat_1" }),
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/redan kopplad/i);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("verifies against the project's persisted Vercel project (app_projects)", async () => {
    const res = await POST(verifyRequest({ domain: "site.example", chatId: "chat_1" }));

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v9/projects/vp_app/domains/site.example/verify"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(setProjectVerifiedCustomDomain).toHaveBeenCalledWith("proj_1", "site.example");
    expect(setLatestDeploymentLiveUrlForChat).toHaveBeenCalledWith(
      "chat_1",
      "site.example",
    );
  });

  it("falls back to the latest deployment's Vercel project when the app project has no link", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      vercel_project_id: null,
      vercel_project_name: null,
    });
    getLatestVercelProjectIdForChat.mockResolvedValue("vp_dep");

    const res = await POST(verifyRequest({ domain: "site.example", chatId: "chat_1" }));

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v9/projects/vp_dep/domains/site.example/verify"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns 409 when the site has not been published yet", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      vercel_project_id: null,
      vercel_project_name: null,
    });
    getLatestVercelProjectIdForChat.mockResolvedValue(null);

    const res = await POST(verifyRequest({ domain: "site.example", chatId: "chat_1" }));

    expect(res.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 404 for a chat the caller does not own", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);

    const res = await POST(verifyRequest({ domain: "site.example", chatId: "someone_elses_chat" }));

    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
