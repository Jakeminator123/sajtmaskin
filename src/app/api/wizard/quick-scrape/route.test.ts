import { beforeEach, describe, expect, it, vi } from "vitest";

const quickScrapeWebsite = vi.hoisted(() => vi.fn());
const debugLog = vi.hoisted(() => vi.fn());
const withRateLimit = vi.hoisted(() =>
  vi.fn((_req: Request, _bucket: string, handler: () => Promise<Response>) => handler()),
);

vi.mock("@/lib/webscraper", () => ({ quickScrapeWebsite }));
vi.mock("@/lib/utils/debug", () => ({ debugLog }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit,
}));

const { POST } = await import("./route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/wizard/quick-scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/wizard/quick-scrape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withRateLimit.mockImplementation(
      (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
    );
  });

  it("blocks likely bots before scraping", async () => {
    const response = await POST(
      new Request("http://localhost/api/wizard/quick-scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vercel-bot-score": "99",
        },
        body: JSON.stringify({ url: "https://sajtstudio.se" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(quickScrapeWebsite).not.toHaveBeenCalled();
    expect(withRateLimit).not.toHaveBeenCalled();
  });

  it("returns 429 when the quick-scrape bucket is exhausted", async () => {
    withRateLimit.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }),
    );

    const response = await POST(makeRequest({ url: "https://sajtstudio.se" }));

    expect(response.status).toBe(429);
    expect(quickScrapeWebsite).not.toHaveBeenCalled();
    expect(withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "wizard:quick-scrape",
      expect.any(Function),
    );
  });

  it("rejects malformed or missing URLs before scraping", async () => {
    const malformed = new Request("http://localhost/api/wizard/quick-scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const malformedResponse = await POST(malformed);
    const missingResponse = await POST(makeRequest({}));

    expect(malformedResponse.status).toBe(400);
    expect(await malformedResponse.json()).toEqual({ success: false, error: "Invalid URL" });
    expect(missingResponse.status).toBe(400);
    expect(await missingResponse.json()).toEqual({ success: false, error: "Invalid URL" });
    expect(quickScrapeWebsite).not.toHaveBeenCalled();
  });

  it("returns the scraper result and records completion telemetry", async () => {
    const data = {
      title: "Sajtstudio",
      description: "Webbplatser för svenska företag",
      headings: ["Resultatdriven webb"],
      wordCount: 42,
      hasImages: true,
      textSummary: "En kort sammanfattning",
    };
    quickScrapeWebsite.mockResolvedValue(data);

    const response = await POST(makeRequest({ url: "https://sajtstudio.se" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data });
    expect(quickScrapeWebsite).toHaveBeenCalledWith("https://sajtstudio.se");
    expect(debugLog).toHaveBeenCalledWith(
      "WIZARD",
      "Quick scrape completed",
      expect.objectContaining({
        url: "https://sajtstudio.se",
        title: "Sajtstudio",
        wordCount: 42,
        durationMs: expect.any(Number),
      }),
    );
  });

  it("returns a stable failure envelope when scraping fails", async () => {
    quickScrapeWebsite.mockRejectedValue(new Error("Blockerad URL"));

    const response = await POST(makeRequest({ url: "http://localhost" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: false, error: "Blockerad URL" });
    expect(debugLog).toHaveBeenCalledWith("WIZARD", "Quick scrape failed", {
      error: "Blockerad URL",
    });
  });
});
