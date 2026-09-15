import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getSessionIdFromRequest = vi.hoisted(() => vi.fn());
const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const resolveVercelProjectForAppProject = vi.hoisted(() => vi.fn());
const inspectCustomerDomain = vi.hoisted(() => vi.fn());
const linkCustomerDomain = vi.hoisted(() => vi.fn());
const verifyCustomerDomain = vi.hoisted(() => vi.fn());
const activateCustomerDomain = vi.hoisted(() => vi.fn());
const unlinkCustomerDomain = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/auth/session", () => ({ getSessionIdFromRequest }));
vi.mock("@/lib/db/services/projects", () => ({ getProjectByIdForOwner }));
vi.mock("@/lib/domains/resolve-vercel-project", () => ({ resolveVercelProjectForAppProject }));
vi.mock("@/lib/domains/customer-domain-flow", () => ({
  inspectCustomerDomain,
  linkCustomerDomain,
  verifyCustomerDomain,
  activateCustomerDomain,
  unlinkCustomerDomain,
}));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

const { GET, POST } = await import("./route");

const SNAPSHOT = {
  primary: {
    domain: "exempel.se",
    role: "primary",
    connection: "connected",
    ownership: "verified",
    dns: "valid",
    https: "valid",
    status: "live",
    statusLabel: "Live",
    records: [],
  },
  companion: null,
  liveDomain: "exempel.se",
  candidateDomain: null,
  canActivate: false,
  canUnlink: true,
  redirectArmed: false,
  publishedSlug: "kund",
  slugLocked: true,
  automaticDns: null,
  message: null,
};

function getReq(id: string, query = "") {
  return {
    req: new NextRequest(`https://sajtmaskin.se/api/projects/${id}/domain${query}`),
    params: Promise.resolve({ id }),
  };
}

function postReq(id: string, body: Record<string, unknown>) {
  return {
    req: new NextRequest(`https://sajtmaskin.se/api/projects/${id}/domain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "https://sajtmaskin.se" },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ id }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user_1" });
  getSessionIdFromRequest.mockReturnValue("sess_1");
  getProjectByIdForOwner.mockResolvedValue({
    id: "proj_1",
    custom_domain: null,
    published_slug: "kund",
  });
  resolveVercelProjectForAppProject.mockResolvedValue({
    ok: true,
    vercelProjectId: "vp_owned",
    appProjectId: "proj_1",
    source: "deployment",
    chatId: "chat_1",
  });
  inspectCustomerDomain.mockResolvedValue(SNAPSHOT);
  linkCustomerDomain.mockResolvedValue({ ok: true, snapshot: SNAPSHOT });
  verifyCustomerDomain.mockResolvedValue({ ok: true, snapshot: SNAPSHOT });
  activateCustomerDomain.mockResolvedValue({ ok: true, snapshot: SNAPSHOT });
  unlinkCustomerDomain.mockResolvedValue({ ok: true, snapshot: { ...SNAPSHOT, liveDomain: null } });
});

describe("GET /api/projects/[id]/domain", () => {
  it("returns 404 for a foreign project before any hosting lookup", async () => {
    getProjectByIdForOwner.mockResolvedValue(null);
    const { req, params } = getReq("foreign");
    const response = await GET(req, { params });
    expect(response.status).toBe(404);
    expect(resolveVercelProjectForAppProject).not.toHaveBeenCalled();
    expect(inspectCustomerDomain).not.toHaveBeenCalled();
  });

  it("rejects a reserved hostname before inspect", async () => {
    const { req, params } = getReq("proj_1", "?domain=admin.sajtmaskin.se");
    const response = await GET(req, { params });
    expect(response.status).toBe(400);
    expect(inspectCustomerDomain).not.toHaveBeenCalled();
  });

  it("inspects only the tenant-resolved project", async () => {
    const { req, params } = getReq("proj_1", "?domain=exempel.se");
    const response = await GET(req, { params });
    expect(response.status).toBe(200);
    expect(getProjectByIdForOwner).toHaveBeenCalledWith("proj_1", {
      userId: "user_1",
      sessionId: "sess_1",
    });
    expect(inspectCustomerDomain).toHaveBeenCalledWith({
      hosting: { vercelProjectId: "vp_owned", appProjectId: "proj_1", chatId: "chat_1" },
      domain: "exempel.se",
      checkHttps: true,
    });
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("vp_owned");
  });
});

describe("POST /api/projects/[id]/domain", () => {
  it("returns 404 for a foreign project on every write", async () => {
    getProjectByIdForOwner.mockResolvedValue(null);
    const { req, params } = postReq("foreign", { action: "link", domain: "exempel.se" });
    const response = await POST(req, { params });
    expect(response.status).toBe(404);
    expect(linkCustomerDomain).not.toHaveBeenCalled();
    expect(unlinkCustomerDomain).not.toHaveBeenCalled();
  });

  it("unlinks through the owned project only", async () => {
    const { req, params } = postReq("proj_1", { action: "unlink" });
    const response = await POST(req, { params });
    expect(response.status).toBe(200);
    expect(unlinkCustomerDomain).toHaveBeenCalledWith({
      hosting: { vercelProjectId: "vp_owned", appProjectId: "proj_1", chatId: "chat_1" },
    });
  });
});
