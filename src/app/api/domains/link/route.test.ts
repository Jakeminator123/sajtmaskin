import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const addDomainToProject = vi.hoisted(() => vi.fn());
const isVercelConfigured = vi.hoisted(() => vi.fn());
const addZoneRecord = vi.hoisted(() => vi.fn());
const isLoopiaConfigured = vi.hoisted(() => vi.fn());

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

const { POST } = await import("./route");

describe("POST /api/domains/link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VERCEL_PROJECT_ID", "allowed_project");
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    isVercelConfigured.mockReturnValue(true);
    isLoopiaConfigured.mockReturnValue(false);
    addDomainToProject.mockResolvedValue({ name: "site.example", verified: false });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects caller-supplied Vercel project ids outside the configured workspace", async () => {
    const req = new Request("http://localhost/api/domains/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "site.example", projectId: "other_project" }),
    });

    const res = await POST(req as never);

    expect(res.status).toBe(403);
    expect(addDomainToProject).not.toHaveBeenCalled();
  });

  it("uses the configured Vercel project id for domain linking", async () => {
    const req = new Request("http://localhost/api/domains/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "site.example" }),
    });

    const res = await POST(req as never);

    expect(res.status).toBe(200);
    expect(addDomainToProject).toHaveBeenCalledWith("allowed_project", "site.example", undefined);
  });

  it("auto-sets an A record on the apex and CNAME only on www for .se domains (#32)", async () => {
    isLoopiaConfigured.mockReturnValue(true);
    addDomainToProject.mockResolvedValue({ name: "site.se", verified: false });
    addZoneRecord.mockResolvedValue("OK");

    const req = new Request("http://localhost/api/domains/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "site.se" }),
    });

    const res = await POST(req as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    // Apex (@) must be an A record — a CNAME on the root is invalid DNS.
    expect(addZoneRecord).toHaveBeenCalledWith("site.se", "@", {
      type: "A",
      data: "76.76.21.21",
      ttl: 3600,
    });
    // CNAME belongs only on the www subdomain.
    expect(addZoneRecord).toHaveBeenCalledWith("site.se", "www", {
      type: "CNAME",
      data: "cname.vercel-dns.com",
      ttl: 3600,
    });
    // Regression guard: never write a CNAME on the apex.
    expect(addZoneRecord).not.toHaveBeenCalledWith(
      "site.se",
      "@",
      expect.objectContaining({ type: "CNAME" }),
    );
    expect(json.dnsSetup).toEqual({ success: true, method: "loopia", error: undefined });
  });
});
