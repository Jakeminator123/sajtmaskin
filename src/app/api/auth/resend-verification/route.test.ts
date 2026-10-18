import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUserByEmail = vi.hoisted(() => vi.fn());
const createVerificationToken = vi.hoisted(() => vi.fn());
const sendVerificationEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/users", () => ({ getUserByEmail, createVerificationToken }));
vi.mock("@/lib/email/send", () => ({ sendVerificationEmail }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/config", () => ({ URLS: { baseUrl: "https://example.test" } }));

import { POST } from "./route";

function request(returnTo: string): NextRequest {
  return new NextRequest("https://example.test/api/auth/resend-verification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "customer@example.test", returnTo }),
  });
}

describe("POST /api/auth/resend-verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserByEmail.mockResolvedValue({
      id: "user_1",
      email: "customer@example.test",
      name: "Customer",
      email_verified: false,
    });
    createVerificationToken.mockResolvedValue("verification-token");
    sendVerificationEmail.mockResolvedValue({ success: true });
  });

  it("forwards a canonical analys resume", async () => {
    const response = await POST(request("/analys?resume=build"));

    expect(response.status).toBe(200);
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      "customer@example.test",
      "verification-token",
      expect.objectContaining({ returnTo: "/analys?resume=build" }),
    );
  });

  it("drops an analys returnTo with duplicate resume parameters", async () => {
    const response = await POST(request("/analys?resume=pdf&resume=build"));

    expect(response.status).toBe(200);
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      "customer@example.test",
      "verification-token",
      expect.objectContaining({ returnTo: null }),
    );
  });
});
