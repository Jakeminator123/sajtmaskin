import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const registerUser = vi.hoisted(() => vi.fn());
const isAdminEmail = vi.hoisted(() => vi.fn((_email: string) => false));
const createVerificationToken = vi.hoisted(() => vi.fn());
const sendVerificationEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ registerUser }));

vi.mock("@/lib/db/services/users", () => ({
  isAdminEmail,
  createVerificationToken,
}));

vi.mock("@/lib/email/send", () => ({ sendVerificationEmail }));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/config", () => ({
  URLS: { baseUrl: "https://example.test" },
}));

import { POST } from "./route";

function registerRequest(email: string): NextRequest {
  return new NextRequest("https://example.test/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      name: "Test",
      password: "password123",
    }),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminEmail.mockReturnValue(false);
    createVerificationToken.mockResolvedValue("verification-token");
    sendVerificationEmail.mockResolvedValue({ success: true });
  });

  it("rejects a privileged address before creating a user", async () => {
    const privilegedEmail = "privileged@example.test";
    isAdminEmail.mockImplementation((email: string) => email === privilegedEmail);

    const response = await POST(registerRequest(privilegedEmail));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: "Denna adress kan inte registreras här. Logga in med administratörskontot.",
    });
    expect(registerUser).not.toHaveBeenCalled();
    expect(createVerificationToken).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("keeps the normal email-verification flow for regular users", async () => {
    registerUser.mockResolvedValue({
      user: {
        id: "user_1",
        email: "customer@example.test",
        name: "Customer",
        diamonds: 0,
        free_generation_available: true,
        provider: "email",
      },
      token: "unused-token",
    });

    const response = await POST(registerRequest("customer@example.test"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      requiresEmailVerification: true,
      emailVerificationSent: true,
    });
    expect(registerUser).toHaveBeenCalledWith(
      "customer@example.test",
      "password123",
      "Test",
    );
    expect(createVerificationToken).toHaveBeenCalledWith("user_1");
  });
});
