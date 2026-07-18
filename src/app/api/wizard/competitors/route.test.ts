import { beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  features: { useResponsesApi: false, useBraveSearch: true },
  secrets: { openaiApiKey: "openai-key" },
}));
const requireNotBot = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const generateText = vi.hoisted(() => vi.fn());
const createDirectModel = vi.hoisted(() => vi.fn(() => "model"));
const braveWebSearch = vi.hoisted(() => vi.fn());
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
vi.mock("@/lib/brave-search", () => ({ braveWebSearch }));
vi.mock("@/lib/utils/debug", () => ({ debugLog, errorLog }));

const { POST } = await import("./route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/wizard/competitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/wizard/competitors", () => {
  const commit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    config.features.useResponsesApi = false;
    config.features.useBraveSearch = true;
    config.secrets.openaiApiKey = "openai-key";
    requireNotBot.mockReturnValue(null);
    prepareCredits.mockResolvedValue({ ok: true, commit });
    braveWebSearch.mockResolvedValue([]);
  });

  it("rejects invalid input before reserving credits", async () => {
    const response = await POST(makeRequest({ companyName: "Sajtstudio" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Validation failed",
      competitors: [],
    });
    expect(prepareCredits).not.toHaveBeenCalled();
  });

  it("forwards bot protection and credit rejections", async () => {
    requireNotBot.mockReturnValue(Response.json({ error: "Bot blocked" }, { status: 403 }));
    const blocked = await POST(makeRequest({ companyName: "Sajtstudio", industry: "Webb" }));

    expect(blocked.status).toBe(403);
    expect(prepareCredits).not.toHaveBeenCalled();

    requireNotBot.mockReturnValue(null);
    prepareCredits.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Insufficient credits" }, { status: 402 }),
    });
    const noCredits = await POST(makeRequest({ companyName: "Sajtstudio", industry: "Webb" }));

    expect(noCredits.status).toBe(402);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("fails closed when the legacy provider key is unavailable", async () => {
    config.secrets.openaiApiKey = "";

    const response = await POST(makeRequest({ companyName: "Sajtstudio", industry: "Webb" }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "OPENAI_API_KEY saknas",
      competitors: [],
    });
    expect(braveWebSearch).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("uses search context, normalizes AI output and commits credits", async () => {
    braveWebSearch.mockResolvedValue([
      {
        title: "Konkurrent AB",
        url: "https://konkurrent.example",
        description: "En lokal webbyrå",
      },
    ]);
    generateText.mockResolvedValue({
      text: `Här är JSON:
{"competitors":[{"name":"Konkurrent AB","description":"Lokal byrå","website":"https://konkurrent.example","lat":59.33,"lng":18.07,"isInspiration":true},{"name":"","description":"ignoreras"}],"marketInsight":"Tydlig lokal konkurrens"}`,
    });

    const response = await POST(
      makeRequest({
        companyName: "Sajtstudio",
        industry: "Webb",
        location: "Stockholm",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      competitors: [
        {
          name: "Konkurrent AB",
          description: "Lokal byrå",
          website: "https://konkurrent.example",
          lat: 59.33,
          lng: 18.07,
          isInspiration: true,
        },
      ],
      marketInsight: "Tydlig lokal konkurrens",
    });
    expect(braveWebSearch).toHaveBeenCalledWith("Sajtstudio Webb Stockholm konkurrenter", 8);
    expect(createDirectModel).toHaveBeenCalledWith("openai/gpt-5-mini");
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "model",
        prompt: expect.stringContaining("https://konkurrent.example"),
      }),
    );
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
