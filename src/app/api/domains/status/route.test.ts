import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const resolveVercelProjectForChat = vi.hoisted(() => vi.fn());
const observeVercelDomain = vi.hoisted(() => vi.fn());
const addDomainToProject = vi.hoisted(() => vi.fn());
const addZoneRecord = vi.hoisted(() => vi.fn());
const setProjectVerifiedCustomDomain = vi.hoisted(() => vi.fn());
const clearProjectCustomDomainVerification = vi.hoisted(() => vi.fn());
const setLatestDeploymentLiveUrlForChat = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/domains/resolve-vercel-project", () => ({ resolveVercelProjectForChat }));
vi.mock("@/lib/vercel/domain-observation", () => ({ observeVercelDomain }));
vi.mock("@/lib/vercel/vercel-client", () => ({ addDomainToProject }));
vi.mock("@/lib/loopia/loopia-client", () => ({ addZoneRecord }));
vi.mock("@/lib/db/services/projects", () => ({
  setProjectVerifiedCustomDomain,
  clearProjectCustomDomainVerification,
}));
vi.mock("@/lib/deployment", () => ({ setLatestDeploymentLiveUrlForChat }));

const { GET } = await import("./route");

function request(query: string) {
  return new Request(`http://localhost/api/domains/status?${query}`, {
    method: "GET",
  }) as never;
}

const OBSERVATION = {
  domain: "customer.com",
  connection: "connected",
  ownership: "verified",
  dns: "valid",
  https: "not_checked",
  activation: "not_started",
  records: [],
};

describe("GET /api/domains/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    resolveVercelProjectForChat.mockResolvedValue({
      ok: true,
      vercelProjectId: "vp_tenant_owned",
      appProjectId: "project_1",
      source: "deployment",
    });
    observeVercelDomain.mockResolvedValue(OBSERVATION);
    vi.stubEnv("VERCEL_TEAM_ID", "team_server_owned");
  });

  it("requires authentication before resolving or contacting Vercel", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await GET(request("domain=customer.com&chatId=chat_1"));

    expect(response.status).toBe(401);
    expect(resolveVercelProjectForChat).not.toHaveBeenCalled();
    expect(observeVercelDomain).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign chat before any provider call", async () => {
    resolveVercelProjectForChat.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Chatten hittades inte.",
    });

    const response = await GET(request("domain=customer.com&chatId=foreign"));

    expect(response.status).toBe(404);
    expect(observeVercelDomain).not.toHaveBeenCalled();
  });

  it.each(["sajtmaskin.se", "demo.sajtmaskin.se", "demo.vercel.app"])(
    "rejects reserved host %s before any provider call",
    async (domain) => {
      const response = await GET(request(`domain=${domain}&chatId=chat_1`));

      expect(response.status).toBe(400);
      expect(observeVercelDomain).not.toHaveBeenCalled();
    },
  );

  it("uses only the tenant-resolved project and server-owned team", async () => {
    const response = await GET(
      request(
        "domain=Customer.COM.&chatId=chat_1&projectIdOrName=vp_attacker&teamId=team_attacker",
      ),
    );

    expect(response.status).toBe(200);
    expect(observeVercelDomain).toHaveBeenCalledWith({
      projectId: "vp_tenant_owned",
      domain: "customer.com",
      teamId: "team_server_owned",
    });
    expect(addDomainToProject).not.toHaveBeenCalled();
    expect(addZoneRecord).not.toHaveBeenCalled();
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
    expect(clearProjectCustomDomainVerification).not.toHaveBeenCalled();
    expect(setLatestDeploymentLiveUrlForChat).not.toHaveBeenCalled();
  });

  it("degrades a thrown provider observation to explicit unknowns", async () => {
    observeVercelDomain.mockRejectedValue(new Error("provider down"));

    const response = await GET(request("domain=customer.com&chatId=chat_1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      domain: "customer.com",
      connection: "unknown",
      ownership: "unknown",
      dns: "unknown",
      https: "not_checked",
      activation: "not_started",
      records: [],
    });
  });

  it("returns only the allowlisted observation contract", async () => {
    const response = await GET(request("domain=customer.com&chatId=chat_1"));
    const body = await response.json();

    expect(body).toEqual(OBSERVATION);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("team_server_owned");
    expect(serialized).not.toContain("vp_tenant_owned");
    expect(serialized).not.toContain("verification");
    expect(serialized).not.toContain("conflict");
  });
});
