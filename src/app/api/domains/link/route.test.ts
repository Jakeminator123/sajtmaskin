import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const addDomainToProject = vi.hoisted(() => vi.fn());
const isVercelConfigured = vi.hoisted(() => vi.fn());
const addZoneRecord = vi.hoisted(() => vi.fn());
const isLoopiaConfigured = vi.hoisted(() => vi.fn());
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const getLatestVercelProjectIdForChat = vi.hoisted(() => vi.fn());
const dbSelect = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rate-limit", () => ({
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

vi.mock("@/lib/db/client", () => ({
  db: { select: dbSelect },
  dbConfigured: true,
}));

vi.mock("@/lib/deployment", () => ({
  getLatestVercelProjectIdForChat,
}));

const { POST } = await import("./route");

/** Mimics a resolved drizzle `db.select(...).from(...).where(...).limit(1)` chain. */
function dbRows(rows: unknown[]) {
  return {
    from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
  };
}

function grantRegisteredOwnership() {
  dbSelect.mockReturnValue(dbRows([{ id: "ord_1" }]));
}

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
    dbSelect.mockReturnValue(dbRows([]));
  });

  it("links the domain to the persisted Vercel project when there is no newer deployment (app_projects)", async () => {
    // No deployment fallback → the persisted app_projects link is the only
    // source and still wins. (The deployment lookup now runs first, but returns
    // nothing here.)
    getLatestVercelProjectIdForChat.mockResolvedValue(null);

    const res = await POST(linkRequest({ domain: "site.example", chatId: "chat_1" }));

    expect(res.status).toBe(200);
    expect(addDomainToProject).toHaveBeenCalledWith(
      "vp_app",
      "site.example",
      process.env.VERCEL_TEAM_ID,
    );
  });

  // A#4: a stale `app_projects.vercel_project_id` (e.g. setProjectVercelLink
  // failed on a re-publish) must NOT win over the newest actual deployment.
  it("prefers the latest deployment's Vercel project over a stale app_projects link", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      vercel_project_id: "vp_stale",
      vercel_project_name: "sajtmaskin-chat_1",
    });
    getLatestVercelProjectIdForChat.mockResolvedValue("vp_fresh");

    const res = await POST(linkRequest({ domain: "site.example", chatId: "chat_1" }));

    expect(res.status).toBe(200);
    expect(addDomainToProject).toHaveBeenCalledWith(
      "vp_fresh",
      "site.example",
      process.env.VERCEL_TEAM_ID,
    );
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

  it("returns linked=true with success=false when automatic DNS setup fails", async () => {
    grantRegisteredOwnership();
    isLoopiaConfigured.mockReturnValue(true);
    addZoneRecord.mockResolvedValueOnce("OK").mockResolvedValueOnce("ZONE_ERROR");

    const res = await POST(linkRequest({ domain: "mittforetag.se", chatId: "chat_1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.linked).toBe(true);
    expect(body.success).toBe(false);
    expect(body.dnsSetup).toMatchObject({ success: false, method: "loopia" });
    expect(body.dnsInstructions).not.toBeNull();
  });

  it("returns success=true when automatic DNS setup succeeds", async () => {
    grantRegisteredOwnership();
    isLoopiaConfigured.mockReturnValue(true);
    addZoneRecord.mockResolvedValue("OK");

    const res = await POST(linkRequest({ domain: "mittforetag.se", chatId: "chat_1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.linked).toBe(true);
    expect(body.success).toBe(true);
    expect(body.dnsSetup).toMatchObject({ success: true, method: "loopia" });
  });

  it("skips Loopia DNS when the caller has no registered domain_orders row", async () => {
    isLoopiaConfigured.mockReturnValue(true);

    const res = await POST(linkRequest({ domain: "mittforetag.se", chatId: "chat_1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(addZoneRecord).not.toHaveBeenCalled();
    expect(body.linked).toBe(true);
    expect(body.success).toBe(true);
    expect(body.dnsSetup).toBeNull();
    expect(body.dnsInstructions).toMatchObject({
      message: "Peka din domän till Vercel genom att lägga till dessa DNS-poster hos din registrar:",
      records: [
        { type: "CNAME", host: "www", value: "cname.vercel-dns.com", ttl: 3600 },
        { type: "A", host: "@", value: "76.76.21.21", ttl: 3600 },
      ],
    });
  });

  it("mutates Loopia DNS when the caller has a registered domain_orders row", async () => {
    grantRegisteredOwnership();
    isLoopiaConfigured.mockReturnValue(true);
    addZoneRecord.mockResolvedValue("OK");

    const res = await POST(linkRequest({ domain: "mittforetag.se", chatId: "chat_1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(addZoneRecord).toHaveBeenCalledTimes(2);
    expect(addZoneRecord).toHaveBeenNthCalledWith(1, "mittforetag.se", "@", {
      type: "A",
      data: "76.76.21.21",
      ttl: 3600,
    });
    expect(addZoneRecord).toHaveBeenNthCalledWith(2, "mittforetag.se", "www", {
      type: "CNAME",
      data: "cname.vercel-dns.com",
      ttl: 3600,
    });
    expect(body.linked).toBe(true);
    expect(body.success).toBe(true);
    expect(body.dnsSetup).toMatchObject({ success: true, method: "loopia" });
  });
});
