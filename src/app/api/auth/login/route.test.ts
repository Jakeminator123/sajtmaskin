import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const loginUser = vi.hoisted(() => vi.fn());
const setAuthCookie = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ loginUser, setAuthCookie }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

const { POST } = await import("./route");

function request(body: unknown) {
  return new NextRequest("https://example.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    { email: 42, password: "password123" },
    { email: "customer@example.test", password: ["password123"] },
    { email: "x".repeat(255), password: "password123" },
    { email: "customer@example.test", password: "x".repeat(1_025) },
  ])("rejects malformed or oversized credentials %#", async (body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(loginUser).not.toHaveBeenCalled();
  });

  it("returns the GitHub connection without the token", async () => {
    loginUser.mockResolvedValue({
      token: "jwt",
      user: {
        id: "user_1",
        email: "customer@example.test",
        name: null,
        image: null,
        diamonds: 0,
        free_generation_available: true,
        provider: "email",
        email_verified: true,
        github_token: "gho_secret_token",
        github_username: "customer",
      },
    });

    const response = await POST(
      request({ email: "customer@example.test", password: "password123" }),
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text).user).toMatchObject({
      github_username: "customer",
      github_connected: true,
    });
    expect(text).not.toContain("gho_secret_token");
  });
});
