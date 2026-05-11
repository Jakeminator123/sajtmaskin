import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const setDeploymentDomainForRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/deployment", () => ({
  setDeploymentDomainForRequest,
}));

const { POST } = await import("./route");

describe("POST /api/domains/save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
  });

  it("does not save a domain unless the deployment belongs to the requester", async () => {
    setDeploymentDomainForRequest.mockResolvedValue(false);
    const req = new Request("http://localhost/api/domains/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deploymentId: "dep_other", domain: "Example.COM" }),
    });

    const res = await POST(req as never);

    expect(setDeploymentDomainForRequest).toHaveBeenCalledWith(req, "dep_other", "example.com");
    expect(res.status).toBe(404);
  });

  it("saves a domain through the scoped helper when ownership passes", async () => {
    setDeploymentDomainForRequest.mockResolvedValue(true);
    const req = new Request("http://localhost/api/domains/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deploymentId: "dep_1", domain: "site.example" }),
    });

    const res = await POST(req as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ success: true, deploymentId: "dep_1", domain: "site.example" });
  });
});
