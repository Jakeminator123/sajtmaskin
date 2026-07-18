import { beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  features: { useResponsesApi: false },
  secrets: { openaiApiKey: "openai-key" },
}));
const requireNotBot = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const generateText = vi.hoisted(() => vi.fn());
const createDirectModel = vi.hoisted(() => vi.fn(() => "model"));
const scrapeWebsite = vi.hoisted(() => vi.fn());
const debugLog = vi.hoisted(() => vi.fn());
const errorLog = vi.hoisted(() => vi.fn());

vi.mock("@/lib/config", () => ({
  FEATURES: config.features,
  SECRETS: config.secrets,
}));
vi.mock("@/lib/botProtection", () => ({ requireNotBot }));
vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_request: Request, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));
vi.mock("@/lib/credits/server", () => ({ prepareCredits }));
vi.mock("ai", () => ({ generateText }));
vi.mock("@/lib/builder/direct-model", () => ({ createDirectModel }));
vi.mock("@/lib/webscraper", () => ({ scrapeWebsite }));
vi.mock("@/lib/utils/debug", () => ({ debugLog, errorLog }));

const { POST } = await import("./route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/wizard/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    step: 2,
    data: {
      companyName: "Sajtstudio",
      industry: "webb",
      location: "Stockholm",
    },
    ...overrides,
  };
}

describe("POST /api/wizard/enrich", () => {
  const commit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    config.features.useResponsesApi = false;
    config.secrets.openaiApiKey = "openai-key";
    requireNotBot.mockReturnValue(null);
    prepareCredits.mockResolvedValue({ ok: true, commit });
  });

  it("rejects malformed payloads before reserving credits", async () => {
    const response = await POST(makeRequest({ step: 9, data: {} }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Validation failed" });
    expect(prepareCredits).not.toHaveBeenCalled();
  });

  it("forwards bot protection and credit rejections", async () => {
    requireNotBot.mockReturnValue(Response.json({ error: "Bot blocked" }, { status: 403 }));
    const blocked = await POST(makeRequest(validBody()));

    expect(blocked.status).toBe(403);
    expect(prepareCredits).not.toHaveBeenCalled();

    requireNotBot.mockReturnValue(null);
    prepareCredits.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Insufficient credits" }, { status: 402 }),
    });
    const noCredits = await POST(makeRequest(validBody()));

    expect(noCredits.status).toBe(402);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("fails closed when the legacy provider key is unavailable", async () => {
    config.secrets.openaiApiKey = "";

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "OPENAI_API_KEY saknas" });
    expect(generateText).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("normalizes generated guidance, includes scrape context and commits credits", async () => {
    scrapeWebsite.mockResolvedValue({
      title: "Befintlig sajt",
      description: "Beskrivning",
      headings: ["Rubrik"],
      wordCount: 120,
      images: 2,
      text: "Sidans text",
    });
    generateText.mockResolvedValue({
      text: `{"questions":[{"id":"audience","text":"Vilka vill ni nå?","type":"text","priority":"high"}],"suggestions":[{"type":"audience","text":"Lokala småföretag"}],"insightSummary":"Tydlig lokal position","meta":{"confidence":0.75,"needsClarification":true,"unknowns":["målgrupp"],"priority":"high"}}`,
    });

    const response = await POST(makeRequest(validBody({ scrapeUrl: "https://sajtstudio.se" })));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      questions: [
        {
          id: "audience",
          text: "Vilka vill ni nå?",
          type: "text",
          priority: "high",
        },
      ],
      suggestions: [{ type: "audience", text: "Lokala småföretag" }],
      insightSummary: "Tydlig lokal position",
      meta: {
        confidence: 0.75,
        needsClarification: true,
        unknowns: ["målgrupp"],
        priority: "high",
      },
      scrapedData: {
        title: "Befintlig sajt",
        wordCount: 120,
        hasImages: true,
      },
      contextHash: expect.stringMatching(/^[a-f0-9]{12}$/),
    });
    expect(scrapeWebsite).toHaveBeenCalledWith("https://sajtstudio.se");
    expect(createDirectModel).toHaveBeenCalled();
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "model",
        prompt: expect.stringContaining('Befintlig sajt: "Befintlig sajt"'),
      }),
    );
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
