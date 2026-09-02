import { beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  features: { useResponsesApi: false },
  secrets: { openaiApiKey: "openai-key" },
}));
const requireNotBot = vi.hoisted(() => vi.fn());
const authorizeWizardRun = vi.hoisted(() => vi.fn());
const generateText = vi.hoisted(() => vi.fn());
const createDirectModel = vi.hoisted(() => vi.fn(() => "model"));
const scrapeWebsite = vi.hoisted(() => vi.fn());
const debugLog = vi.hoisted(() => vi.fn());
const errorLog = vi.hoisted(() => vi.fn());

vi.mock("@/lib/config", () => ({
  FEATURES: config.features,
  SECRETS: config.secrets,
}));
vi.mock("@/lib/bot-protection", () => ({ requireNotBot }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: Request, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));
vi.mock("@/lib/wizard/authorize-wizard-run", () => ({ authorizeWizardRun }));
vi.mock("ai", () => ({ generateText }));
vi.mock("@/lib/builder/direct-model", () => ({ createDirectModel }));
vi.mock("@/lib/webscraper", () => ({ scrapeWebsite }));
vi.mock("@/lib/utils/debug", () => ({ debugLog, errorLog }));

const { POST } = await import("./route");

const WIZARD_RUN_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(body: unknown): Request {
  const payload = {
    wizardRunId: WIZARD_RUN_ID,
    ...(body as Record<string, unknown>),
  };
  return new Request("http://localhost/api/wizard/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.useResponsesApi = false;
    config.secrets.openaiApiKey = "openai-key";
    requireNotBot.mockReturnValue(null);
    authorizeWizardRun.mockResolvedValue({
      ok: true,
      user: { id: "user_1" },
      run: { id: WIZARD_RUN_ID },
    });
  });

  it("rejects malformed payloads before authorizing the run", async () => {
    const response = await POST(makeRequest({ step: 9, data: {} }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Validation failed" });
    expect(authorizeWizardRun).not.toHaveBeenCalled();
  });

  it("forwards bot protection and run rejections", async () => {
    requireNotBot.mockReturnValue(Response.json({ error: "Bot blocked" }, { status: 403 }));
    const blocked = await POST(makeRequest(validBody()));

    expect(blocked.status).toBe(403);
    expect(authorizeWizardRun).not.toHaveBeenCalled();

    requireNotBot.mockReturnValue(null);
    authorizeWizardRun.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Wizard-körningen är avslutad." }, { status: 409 }),
    });
    const denied = await POST(makeRequest(validBody()));

    expect(denied.status).toBe(409);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("fails closed when the legacy provider key is unavailable", async () => {
    config.secrets.openaiApiKey = "";

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "OPENAI_API_KEY saknas" });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("normalizes generated guidance and includes scrape context without a second debit", async () => {
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
    expect(authorizeWizardRun).toHaveBeenCalledWith(expect.any(Request), WIZARD_RUN_ID);
  });
});
