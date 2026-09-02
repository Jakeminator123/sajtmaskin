import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

const { POST } = await import("./route");

describe("POST /api/inspector-ai-match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(null);
  });

  it("requires a logged-in user before AI matching", async () => {
    const res = await POST(new Request("http://localhost/api/inspector-ai-match", { method: "POST" }));

    expect(res.status).toBe(401);
  });

  it("rejects a spoofed x-session-id without a user", async () => {
    const res = await POST(
      new Request("http://localhost/api/inspector-ai-match", {
        method: "POST",
        headers: { "x-session-id": "anything" },
      }),
    );

    expect(res.status).toBe(401);
    expect(getCurrentUser).toHaveBeenCalled();
  });
});
