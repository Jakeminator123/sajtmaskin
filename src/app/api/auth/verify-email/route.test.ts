import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getUserByVerificationToken, verifyEmailWithPassword, isAdminEmail } = vi.hoisted(() => ({
  getUserByVerificationToken: vi.fn(), verifyEmailWithPassword: vi.fn(), isAdminEmail: vi.fn(),
}));
vi.mock("@/lib/db/services/users", () => ({ getUserByVerificationToken, verifyEmailWithPassword, isAdminEmail }));
vi.mock("@/lib/config", () => ({ URLS: { baseUrl: "https://example.test" }, SECRETS: { jwtSecret: "test" } }));
vi.mock("@/lib/rate-limit", () => ({ withRateLimit: (_req: unknown, _key: unknown, fn: () => unknown) => fn() }));

import { GET, POST } from "./route";
import { verifyPassword } from "@/lib/auth/auth";

function post(body: Record<string, unknown>, token = "tok") {
  return new NextRequest("https://example.test/api/auth/verify-email", {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: `sajtmaskin_email_verification=${token}` },
    body: JSON.stringify({ password: "owner-secret", confirmPassword: "owner-secret", ...body }),
  });
}

describe("email verification ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserByVerificationToken.mockResolvedValue({ id: "user_1", email: "owner@example.test", email_verified: false });
    verifyEmailWithPassword.mockResolvedValue(true);
    isAdminEmail.mockReturnValue(false);
  });

  it.each(["/kostnadsfri/zax-2-0-ab", "/analys?resume=pdf", "/analys?resume=build"])("opens a password step and preserves %s without activating the pre-account", async (returnTo) => {
    const response = await GET(new NextRequest(`https://example.test/api/auth/verify-email?token=tok&returnTo=${encodeURIComponent(returnTo)}`));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/verify-email");
    expect(location.searchParams.get("returnTo")).toBe(returnTo);
    expect(location.searchParams.has("token")).toBe(false);
    expect(verifyEmailWithPassword).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("replaces the password and redirects to the legitimate resume without creating a session", async () => {
    const response = await POST(post({ returnTo: "/analys?resume=pdf" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, redirectTo: "https://example.test/analys?resume=pdf&verified=success" });
    const [token, hash] = verifyEmailWithPassword.mock.calls[0];
    expect(token).toBe("tok");
    expect(verifyPassword("owner-secret", hash)).toBe(true);
    expect(verifyPassword("attacker-secret", hash)).toBe(false);
    expect(response.headers.get("set-cookie")).not.toContain("auth_token");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects mismatched passwords without consuming the token", async () => {
    expect((await POST(post({ confirmPassword: "different" }))).status).toBe(400);
    expect(verifyEmailWithPassword).not.toHaveBeenCalled();
  });

  it("rejects a token lost to a concurrent verifier", async () => {
    verifyEmailWithPassword.mockResolvedValue(false);
    expect((await POST(post({}))).status).toBe(400);
  });

  it("rejects expired, replaced or already consumed links", async () => {
    getUserByVerificationToken.mockResolvedValue(null);
    const response = await GET(new NextRequest("https://example.test/api/auth/verify-email?token=old&returnTo=%2Fanalys%3Fresume%3Dbuild"));
    expect(response.headers.get("location")).toBe("https://example.test/analys?resume=build&verified=error&reason=invalid_or_expired");
    expect((await POST(post({}))).status).toBe(400);
    expect(verifyEmailWithPassword).not.toHaveBeenCalled();
  });

  it("rejects tokens for an address that became privileged", async () => {
    isAdminEmail.mockReturnValue(true);
    expect((await POST(post({}))).status).toBe(400);
    expect(verifyEmailWithPassword).not.toHaveBeenCalled();
  });

  it("ignores a foreign return target", async () => {
    const response = await POST(post({ returnTo: "https://evil.example/" }));
    expect(await response.json()).toMatchObject({ redirectTo: "https://example.test/?verified=success" });
  });

  it("rejects oversized tokens before lookup", async () => {
    await GET(new NextRequest(`https://example.test/api/auth/verify-email?token=${"x".repeat(257)}`));
    expect(getUserByVerificationToken).not.toHaveBeenCalled();
  });
});
