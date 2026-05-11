import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getVercelToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/vercel", () => ({
  getVercelToken,
}));

const { POST } = await import("./route");

describe("POST /api/domains/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VERCEL_PROJECT_ID", "allowed_project");
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getVercelToken.mockReturnValue("token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ name: "site.example", verified: true })),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects caller-supplied Vercel project ids outside the configured workspace", async () => {
    const req = new Request("http://localhost/api/domains/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "site.example", projectId: "other_project" }),
    });

    const res = await POST(req as never);

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the configured Vercel project id for verification", async () => {
    const req = new Request("http://localhost/api/domains/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "site.example" }),
    });

    const res = await POST(req as never);

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v9/projects/allowed_project/domains/site.example/verify"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
