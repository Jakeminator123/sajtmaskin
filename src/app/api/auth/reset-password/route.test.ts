import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { findUsablePasswordResetToken, consumePasswordResetToken, getUserById, isAdminEmail } =
  vi.hoisted(() => ({
    findUsablePasswordResetToken: vi.fn(),
    consumePasswordResetToken: vi.fn(),
    getUserById: vi.fn(),
    isAdminEmail: vi.fn(),
  }));

vi.mock("@/lib/db/services/password-reset", () => ({
  MAX_PASSWORD_RESET_TOKEN_LENGTH: 256,
  findUsablePasswordResetToken,
  consumePasswordResetToken,
}));
vi.mock("@/lib/db/services/users", () => ({ getUserById, isAdminEmail }));
vi.mock("@/lib/config", () => ({ URLS: { baseUrl: "https://example.test" }, SECRETS: { jwtSecret: "test" } }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: unknown, _key: unknown, fn: () => unknown) => fn(),
}));

import { GET, POST } from "./route";
import { verifyPassword } from "@/lib/auth/auth";

function post(body: Record<string, unknown>, token: string | null = "tok") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) headers.Cookie = `sajtmaskin_password_reset=${token}`;
  return new NextRequest("https://example.test/api/auth/reset-password", {
    method: "POST",
    headers,
    body: JSON.stringify({ password: "new-secret", confirmPassword: "new-secret", ...body }),
  });
}

describe("password reset link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUsablePasswordResetToken.mockResolvedValue({
      userId: "user_1",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    consumePasswordResetToken.mockResolvedValue("user_1");
    getUserById.mockResolvedValue({ id: "user_1", email: "owner@example.test" });
    isAdminEmail.mockReturnValue(false);
  });

  it("moves a valid token into an httpOnly cookie without consuming it", async () => {
    const response = await GET(
      new NextRequest("https://example.test/api/auth/reset-password?token=tok"),
    );
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/aterstall-losenord");
    expect(location.searchParams.has("token")).toBe(false);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sajtmaskin_password_reset=tok");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api/auth/reset-password");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(consumePasswordResetToken).not.toHaveBeenCalled();
  });

  it("sends expired, used or unknown links to the invalid state", async () => {
    findUsablePasswordResetToken.mockResolvedValue(null);
    const response = await GET(
      new NextRequest("https://example.test/api/auth/reset-password?token=old"),
    );
    expect(response.headers.get("location")).toBe(
      "https://example.test/aterstall-losenord?status=invalid",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects missing and oversized tokens before lookup", async () => {
    await GET(new NextRequest("https://example.test/api/auth/reset-password"));
    await GET(
      new NextRequest(`https://example.test/api/auth/reset-password?token=${"x".repeat(257)}`),
    );
    expect(findUsablePasswordResetToken).not.toHaveBeenCalled();
  });

  it("replaces the password once, clears the cookie and creates no session", async () => {
    const response = await POST(post({}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    const [token, hash] = consumePasswordResetToken.mock.calls[0];
    expect(token).toBe("tok");
    expect(verifyPassword("new-secret", hash)).toBe(true);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sajtmaskin_password_reset=;");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).not.toContain("auth_token");
  });

  it("rejects mismatched or short passwords without consuming the link", async () => {
    expect((await POST(post({ confirmPassword: "different" }))).status).toBe(400);
    expect((await POST(post({ password: "abc", confirmPassword: "abc" }))).status).toBe(400);
    expect(consumePasswordResetToken).not.toHaveBeenCalled();
  });

  it("rejects a request without the cookie", async () => {
    expect((await POST(post({}, null))).status).toBe(400);
    expect(findUsablePasswordResetToken).not.toHaveBeenCalled();
  });

  it("rejects a link lost to a concurrent reset", async () => {
    consumePasswordResetToken.mockResolvedValue(null);
    const response = await POST(post({}));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Länken är ogiltig");
  });

  it("never sets a password for an address that became privileged", async () => {
    isAdminEmail.mockReturnValue(true);
    expect((await POST(post({}))).status).toBe(400);
    expect(consumePasswordResetToken).not.toHaveBeenCalled();
  });
});
