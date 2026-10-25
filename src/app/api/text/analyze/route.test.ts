import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const responsesCreate = vi.hoisted(() => vi.fn());
const config = vi.hoisted(() => ({
  features: { useResponsesApi: true },
  secrets: { openaiApiKey: "test-key" },
}));
vi.mock("openai", () => ({
  default: class { responses = { create: responsesCreate }; },
}));

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/config", () => ({
  FEATURES: config.features,
  SECRETS: config.secrets,
}));

const { POST, maxDuration } = await import("./route");

describe("POST /api/text/analyze", () => {
  it.each([true, false])("bounds output and request lifetime with Responses flag %s", async (enabled) => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    config.features.useResponsesApi = enabled;
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    responsesCreate.mockResolvedValue({ output_text: JSON.stringify({
      summary: "Sammanfattning", suggestions: [{ id: "hero", label: "Hero", description: "Rubrik", prompt: "Skapa hero" }],
    }) });
    const request = new NextRequest("http://localhost/api/text/analyze", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Hej", filename: "text.txt" }),
    });
    try {
      const response = await POST(request);
      expect(await response.json()).toMatchObject({ success: true, summary: "Sammanfattning" });
      expect(responsesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-6.1-sol", max_output_tokens: 8192, reasoning: { effort: "medium" } }),
        { signal: request.signal, timeout: 30000, maxRetries: 0 },
      );
      expect(maxDuration).toBe(45);
    } finally { vi.unstubAllEnvs(); }
  });

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

  it.each([
    ["invalid JSON", "not-json", 400],
    ["null", "null", 400],
    ["array", "[]", 400],
    ["object content", '{"content":{}}', 400],
    ["object filename", '{"content":"Hej","filename":{}}', 400],
    ["oversized content", JSON.stringify({ content: "x".repeat(100_001) }), 413],
  ])("rejects %s before calling OpenAI", async (_label, body, status) => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    const req = new NextRequest("http://localhost/api/text/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const res = await POST(req);

    expect(res.status).toBe(status);
    expect(responsesCreate).not.toHaveBeenCalled();
  });

  it("returns a failing HTTP status when OpenAI fails", async () => {
    config.features.useResponsesApi = true;
    config.secrets.openaiApiKey = "test-key";
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    responsesCreate.mockRejectedValue(new Error("upstream unavailable"));
    const req = new NextRequest("http://localhost/api/text/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Hej", filename: "text.txt" }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.suggestions).toHaveLength(6);
  });
});
