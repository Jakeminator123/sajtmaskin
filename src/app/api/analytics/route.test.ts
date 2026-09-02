import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const withRateLimit = vi.hoisted(() =>
  vi.fn((_req: Request, _bucket: string, handler: () => Promise<Response>) => handler()),
);

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit,
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminAccess: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionIdFromRequest: () => "sess_1",
}));

vi.mock("@/lib/db/services/analytics", () => ({
  getAnalyticsStats: vi.fn(),
  recordPageView: vi.fn(),
}));

const { POST } = await import("./route");

describe("POST /api/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withRateLimit.mockImplementation(
      (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
    );
  });

  it("rejects a non-string path before recording", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: 12 }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it("returns 429 when the pageview bucket is exhausted", async () => {
    withRateLimit.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }),
    );

    const res = await POST(
      new NextRequest("http://localhost/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/builder" }),
      }),
    );

    expect(res.status).toBe(429);
    expect(withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "analytics:pageview",
      expect.any(Function),
    );
  });
});
