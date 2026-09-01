import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const registerUser = vi.hoisted(() => vi.fn());
const setAuthCookie = vi.hoisted(() => vi.fn());
const isAdminEmail = vi.hoisted(() => vi.fn((_email: string) => false));
const createVerificationToken = vi.hoisted(() => vi.fn());
const sendVerificationEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  registerUser,
  setAuthCookie,
}));

vi.mock("@/lib/db/services/users", () => ({
  isAdminEmail,
  createVerificationToken,
}));

vi.mock("@/lib/email/send", () => ({
  sendVerificationEmail,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/config", () => ({
  URLS: { baseUrl: "https://test.invalid" },
}));

import { POST } from "./route";

function registerRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminEmail.mockReturnValue(false);
    createVerificationToken.mockResolvedValue("verify-token");
    sendVerificationEmail.mockResolvedValue({ success: true });
  });

  it("rejects a privileged ADMIN_EMAILS address before creating a row or cookie", async () => {
    isAdminEmail.mockImplementation((email: string) => email === "admin@sajtmaskin.se");

    const res = await POST(
      registerRequest({
        email: "admin@sajtmaskin.se",
        password: "attacker-password",
        name: "Attacker",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({
      success: false,
      error: "Denna adress kan inte registreras här. Logga in med administratörskontot.",
    });
    expect(registerUser).not.toHaveBeenCalled();
    expect(setAuthCookie).not.toHaveBeenCalled();
  });

  it("registers a normal email and requires verification", async () => {
    registerUser.mockResolvedValue({
      user: {
        id: "user_1",
        email: "kund@example.com",
        name: "Kund",
        diamonds: 0,
        free_generation_available: true,
        provider: "email",
      },
      token: "unused-token",
    });

    const res = await POST(
      registerRequest({
        email: "kund@example.com",
        password: "safe-password",
        name: "Kund",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      requiresEmailVerification: true,
    });
    expect(registerUser).toHaveBeenCalledWith("kund@example.com", "safe-password", "Kund");
    expect(setAuthCookie).not.toHaveBeenCalled();
  });
});
