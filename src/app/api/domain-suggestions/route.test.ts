import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const generateText = vi.hoisted(() => vi.fn());
const withRateLimit = vi.hoisted(() =>
  vi.fn((_req: Request, _bucket: string, handler: () => Promise<Response>) => handler()),
);

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit,
}));

vi.mock("ai", () => ({
  generateText,
}));

vi.mock("@/lib/builder/direct-model", () => ({
  createDirectModel: vi.fn(),
}));

const { POST } = await import("./route");

describe("POST /api/domain-suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(null);
    withRateLimit.mockImplementation(
      (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
    );
  });

  it("requires login before spending an LLM call", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/domain-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: "Acme" }),
      }),
    );

    expect(res.status).toBe(401);
    expect(generateText).not.toHaveBeenCalled();
    expect(withRateLimit).not.toHaveBeenCalled();
  });

  it("returns 429 when the domain suggestion bucket is exhausted", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    withRateLimit.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }),
    );

    const res = await POST(
      new NextRequest("http://localhost/api/domain-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: "Acme" }),
      }),
    );

    expect(res.status).toBe(429);
    expect(withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "domains:suggest",
      expect.any(Function),
      { userId: "user_1" },
    );
  });
});
