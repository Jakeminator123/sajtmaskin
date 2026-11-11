import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));

const { GET } = await import("./route");

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    email: "anna@example.test",
    name: "Anna",
    image: null,
    diamonds: 12,
    free_generation_available: false,
    provider: "email",
    email_verified: true,
    password_hash: "hash-secret",
    verification_token: "verify-secret",
    github_token: "gho_secret_token",
    github_username: "Anna-Dev",
    ...overrides,
  };
}

async function me() {
  const response = await GET(new NextRequest("https://example.test/api/auth/me"));
  return { response, text: await response.text() };
}

describe("GET /api/auth/me", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports the GitHub connection without sending the token", async () => {
    getCurrentUser.mockResolvedValue(dbUser());

    const { response, text } = await me();
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      id: "user_1",
      github_username: "Anna-Dev",
      github_connected: true,
    });
    expect(body.user).not.toHaveProperty("github_token");
    expect(text).not.toContain("gho_secret_token");
    expect(text).not.toContain("hash-secret");
    expect(text).not.toContain("verify-secret");
  });

  it.each([
    { github_token: null, github_username: null },
    { github_token: null, github_username: "stale-login" },
    { github_token: "gho_orphan", github_username: null },
  ])("reports a partial or missing connection as not connected %#", async (github) => {
    getCurrentUser.mockResolvedValue(dbUser(github));

    const { text } = await me();
    const body = JSON.parse(text);

    expect(body.user.github_connected).toBe(false);
    expect(text).not.toContain("gho_orphan");
  });
});
