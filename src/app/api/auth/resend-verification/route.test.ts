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

function requestBody(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/auth/resend-verification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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

  it("rejects an oversized body before account lookup", async () => {
    const req = request("/analys?resume=build");
    req.headers.set("content-length", "4097");
    const response = await POST(req);

    expect(response.status).toBe(413);
    expect(getUserByEmail).not.toHaveBeenCalled();
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

  it("rejects an oversized email before lookup", async () => {
    const response = await POST(requestBody({ email: `${"x".repeat(255)}@example.test` }));

    expect(response.status).toBe(400);
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("drops an oversized return target before URL parsing", async () => {
    const response = await POST(
      requestBody({ email: "customer@example.test", returnTo: `/${"x".repeat(2_048)}` }),
    );

    expect(response.status).toBe(200);
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      "customer@example.test",
      "verification-token",
      expect.objectContaining({ returnTo: null }),
    );
  });
});
