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
  getTemperatureConfig: vi.fn(() => ({})),
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

  it.each([
    null,
    { companyName: 42 },
    { companyName: "A".repeat(201) },
    { companyName: "Acme", keywords: "webb" },
    { companyName: "Acme", keywords: Array.from({ length: 11 }, () => "webb") },
  ])("rejects invalid input before spending an LLM call: %j", async (body) => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });

    const res = await POST(
      new NextRequest("http://localhost/api/domain-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

    expect(res.status).toBe(400);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("filters invalid and duplicate model names before availability checks", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    generateText.mockResolvedValue({
      text: '[42, "!!!", "Good Name", "good-name", "GOOD NAME"]',
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    vi.useFakeTimers();

    try {
      const responsePromise = POST(
        new NextRequest("http://localhost/api/domain-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName: "Acme" }),
        }),
      );
      await vi.runAllTimersAsync();
      const response = await responsePromise;
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.suggestions.map((item: { domain: string }) => item.domain)).toEqual([
        "goodname.se",
        "goodname.com",
        "good-name.se",
        "good-name.com",
      ]);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });
});
