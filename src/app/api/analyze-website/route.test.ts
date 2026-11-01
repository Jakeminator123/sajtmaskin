import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const generateText = vi.hoisted(() => vi.fn());
const quickScrapeWebsite = vi.hoisted(() => vi.fn());
const createDirectModel = vi.hoisted(() => vi.fn(() => "model"));
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

vi.mock("@/lib/builder/direct-model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/builder/direct-model")>();
  return { ...actual, createDirectModel };
});

vi.mock("@/lib/webscraper", () => ({
  quickScrapeWebsite,
}));

vi.mock("@/lib/ai-models/load-manifest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-models/load-manifest")>();
  return {
    ...actual,
    getWorkloadDefaultModelFromManifest: () => "openai/gpt-6.1-sol",
    getWorkloadReasoningEffortFromManifest: () => "medium",
  };
});

const { POST } = await import("./route");

describe("POST /api/analyze-website", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(null);
    withRateLimit.mockImplementation(
      (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
    );
  });

  it("requires login before scraping or spending an LLM call", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/analyze-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com" }),
      }),
    );

    expect(res.status).toBe(401);
    expect(quickScrapeWebsite).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(withRateLimit).not.toHaveBeenCalled();
  });

  it("returns 429 when the website analysis bucket is exhausted", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    withRateLimit.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }),
    );

    const res = await POST(
      new NextRequest("http://localhost/api/analyze-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com" }),
      }),
    );

    expect(res.status).toBe(429);
    expect(withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "analyze:website",
      expect.any(Function),
      { userId: "user_1" },
    );
    expect(generateText).not.toHaveBeenCalled();
  });

  it.each([null, [], { url: 42 }])(
    "rejects an invalid payload before scraping or spending an LLM call: %j",
    async (body) => {
      getCurrentUser.mockResolvedValue({ id: "user_1" });

      const res = await POST(
        new NextRequest("http://localhost/api/analyze-website", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );

      expect(res.status).toBe(400);
      expect(quickScrapeWebsite).not.toHaveBeenCalled();
      expect(generateText).not.toHaveBeenCalled();
    },
  );

  it("caps client-supplied scrape text to the server-owned 200-word budget", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    generateText.mockResolvedValue({ text: "Kort analys." });
    const words = Array.from({ length: 220 }, (_, index) => `word-${index + 1}`);

    try {
      const res = await POST(
        new NextRequest("http://localhost/api/analyze-website", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: "https://example.com",
            scrapedContent: { textSummary: words.join(" ") },
          }),
        }),
      );

      expect(res.status).toBe(200);
      expect(quickScrapeWebsite).not.toHaveBeenCalled();
      const options = generateText.mock.calls[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };
      const prompt = options.messages.find((message) => message.role === "user")?.content ?? "";
      expect(prompt).toContain("word-200");
      expect(prompt).not.toContain("word-201");
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });

  it("also caps a single unbroken scrape token by characters", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    generateText.mockResolvedValue({ text: "Kort analys." });

    try {
      const res = await POST(
        new NextRequest("http://localhost/api/analyze-website", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: "https://example.com",
            scrapedContent: { textSummary: `start-${"x".repeat(20_000)}-end` },
          }),
        }),
      );

      expect(res.status).toBe(200);
      const options = generateText.mock.calls[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };
      const prompt = options.messages.find((message) => message.role === "user")?.content ?? "";
      expect(prompt).toContain("start-");
      expect(prompt).not.toContain("-end");
      expect(prompt.length).toBeLessThan(13_000);
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });

  it.each(["file:///etc/passwd", "https://user:secret@example.com/"])(
    "rejects unsafe URL forms before scraping: %s",
    async (url) => {
      getCurrentUser.mockResolvedValue({ id: "user_1" });

      const res = await POST(
        new NextRequest("http://localhost/api/analyze-website", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, scrapedContent: { textSummary: "Client supplied text" } }),
        }),
      );

      expect(res.status).toBe(400);
      expect(quickScrapeWebsite).not.toHaveBeenCalled();
      expect(generateText).not.toHaveBeenCalled();
    },
  );

  it("sends Sol medium with an 8192 total output cap and no temperature", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    quickScrapeWebsite.mockResolvedValue({
      title: "Exempel",
      description: "En sida",
      headings: ["Hem"],
      wordCount: 40,
      textSummary: "Det här är tillräckligt med text för en analys av sidan.",
    });
    generateText.mockResolvedValue({ text: "Kort analys." });

    try {
      const res = await POST(
        new NextRequest("http://localhost/api/analyze-website", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://example.com" }),
        }),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        success: true,
        model: "openai/gpt-6.1-sol",
      });
      expect(createDirectModel).toHaveBeenCalledWith("openai/gpt-6.1-sol");
      expect(generateText).toHaveBeenCalledTimes(1);
      const sdkOptions = generateText.mock.calls[0][0] as Record<string, unknown>;
      expect(sdkOptions).toEqual(
        expect.objectContaining({
          maxOutputTokens: 8_192,
          model: "model",
          providerOptions: { openai: { reasoningEffort: "medium" } },
        }),
      );
      expect(sdkOptions).not.toHaveProperty("temperature");
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });
});
