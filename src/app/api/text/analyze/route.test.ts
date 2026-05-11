import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/config", () => ({
  FEATURES: { useResponsesApi: true },
  SECRETS: { openaiApiKey: "" },
}));

const { POST } = await import("./route");

describe("POST /api/text/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before analyzing text", async () => {
    getCurrentUser.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/text/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "secret text", filename: "notes.txt" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });
});
