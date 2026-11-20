import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getUserByEmail, isAdminEmail, createPasswordResetToken, sendPasswordResetEmail, rateLimitKeys } =
  vi.hoisted(() => ({
    getUserByEmail: vi.fn(),
    isAdminEmail: vi.fn(),
    createPasswordResetToken: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    rateLimitKeys: [] as string[],
  }));

vi.mock("@/lib/db/services/users", () => ({ getUserByEmail, isAdminEmail }));
vi.mock("@/lib/db/services/password-reset", () => ({
  PASSWORD_RESET_TOKEN_TTL_MS: 60 * 60 * 1000,
  createPasswordResetToken,
}));
vi.mock("@/lib/email/send", () => ({ sendPasswordResetEmail }));
vi.mock("@/lib/config", () => ({ URLS: { baseUrl: "https://example.test" } }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, key: string, handler: () => Promise<Response>) => {
    rateLimitKeys.push(key);
    return handler();
  },
}));

import { POST } from "./route";

function request(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitKeys.length = 0;
    getUserByEmail.mockResolvedValue({ id: "user_1", email: "owner@example.test", name: "Owner" });
    isAdminEmail.mockReturnValue(false);
    createPasswordResetToken.mockResolvedValue("reset-token");
    sendPasswordResetEmail.mockResolvedValue({ success: true });
  });

  it("is rate limited and mails a one-hour link to an existing account", async () => {
    const response = await POST(request({ email: " Owner@Example.test " }));
    expect(response.status).toBe(200);
    expect(rateLimitKeys).toEqual(["auth:password-reset-request"]);
    expect(getUserByEmail).toHaveBeenCalledWith("owner@example.test");
    expect(sendPasswordResetEmail).toHaveBeenCalledWith("owner@example.test", "reset-token", {
      name: "Owner",
      baseUrl: "https://example.test",
      validMinutes: 60,
    });
  });

  it("answers identically for unknown, privileged and cooling-down accounts", async () => {
    const known = await (await POST(request({ email: "owner@example.test" }))).json();

    getUserByEmail.mockResolvedValueOnce(null);
    const unknown = await (await POST(request({ email: "nobody@example.test" }))).json();

    isAdminEmail.mockReturnValueOnce(true);
    const privileged = await (await POST(request({ email: "admin@example.test" }))).json();

    createPasswordResetToken.mockResolvedValueOnce(null);
    const cooldown = await (await POST(request({ email: "owner@example.test" }))).json();

    expect(unknown).toEqual(known);
    expect(privileged).toEqual(known);
    expect(cooldown).toEqual(known);
    expect(known.success).toBe(true);
    // Bara det första anropet mejlade.
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("does not reveal delivery failures", async () => {
    sendPasswordResetEmail.mockResolvedValueOnce({ success: false, deliveryMode: "provider_missing" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request({ email: "owner@example.test" }));
    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
    errorSpy.mockRestore();
  });

  it("rejects a missing or malformed address before lookup", async () => {
    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request({ email: "not-an-email" }))).status).toBe(400);
    expect(getUserByEmail).not.toHaveBeenCalled();
  });
});
