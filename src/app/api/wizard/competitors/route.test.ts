import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { WIZARD_COMPETITORS_MAX_DURATION_S } from "@/lib/wizard/route-deadline";

const config = vi.hoisted(() => ({
  features: { useResponsesApi: false, useBraveSearch: true },
  secrets: { openaiApiKey: "openai-key" },
}));
const requireNotBot = vi.hoisted(() => vi.fn());
const authorizeWizardRun = vi.hoisted(() => vi.fn());
const generateText = vi.hoisted(() => vi.fn());
const createDirectModel = vi.hoisted(() => vi.fn(() => "model"));
const braveWebSearch = vi.hoisted(() => vi.fn());
const debugLog = vi.hoisted(() => vi.fn());
const errorLog = vi.hoisted(() => vi.fn());
const emitWizardRouteTerminal = vi.hoisted(() => vi.fn());
const deadlineActual = vi.hoisted(() => ({
  race: undefined as
    | undefined
    | ((signal: AbortSignal, work: () => Promise<unknown>) => Promise<unknown>),
}));
const raceWizardDeadline = vi.hoisted(() =>
  vi.fn((signal: AbortSignal, work: () => Promise<unknown>) => deadlineActual.race!(signal, work)),
);

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
vi.mock("@/lib/brave-search", () => ({ braveWebSearch }));
vi.mock("@/lib/utils/debug", () => ({ debugLog, errorLog }));
vi.mock("@/lib/wizard/route-telemetry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wizard/route-telemetry")>();
  return { ...actual, emitWizardRouteTerminal };
});
vi.mock("@/lib/wizard/route-deadline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wizard/route-deadline")>();
  deadlineActual.race = actual.raceWizardDeadline;
  return { ...actual, raceWizardDeadline };
});

const { POST, maxDuration } = await import("./route");

const WIZARD_RUN_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(body: unknown): Request {
  const payload = {
    wizardRunId: WIZARD_RUN_ID,
    ...(body as Record<string, unknown>),
  };
  return new Request("http://localhost/api/wizard/competitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/wizard/competitors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.useResponsesApi = false;
    config.features.useBraveSearch = true;
    config.secrets.openaiApiKey = "openai-key";
    requireNotBot.mockReturnValue(null);
    authorizeWizardRun.mockResolvedValue({
      ok: true,
      user: { id: "user_1" },
      run: { id: WIZARD_RUN_ID },
    });
    braveWebSearch.mockResolvedValue([]);
  });

  it("rejects invalid input before authorizing the run", async () => {
    const response = await POST(makeRequest({ companyName: "Sajtstudio" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Validation failed",
      competitors: [],
    });
    expect(authorizeWizardRun).not.toHaveBeenCalled();
  });

  it("forwards bot protection and run rejections without calling the model", async () => {
    requireNotBot.mockReturnValue(Response.json({ error: "Bot blocked" }, { status: 403 }));
    const blocked = await POST(makeRequest({ companyName: "Sajtstudio", industry: "Webb" }));

    expect(blocked.status).toBe(403);
    expect(authorizeWizardRun).not.toHaveBeenCalled();

    requireNotBot.mockReturnValue(null);
    authorizeWizardRun.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Ogiltig wizard-körning." }, { status: 403 }),
    });
    const denied = await POST(makeRequest({ companyName: "Sajtstudio", industry: "Webb" }));

    expect(denied.status).toBe(403);
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
  });

  it("uses search context and normalizes AI output without a second debit", async () => {
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
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(authorizeWizardRun).toHaveBeenCalledWith(expect.any(Request), WIZARD_RUN_ID);
    expect(emitWizardRouteTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "competitors",
        outcome: "ok",
        aborted: false,
      }),
    );
  });

  it("keeps the 25s route budget and emits a terminal event on validation failure", async () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "route.ts"), "utf8");
    expect(maxDuration).toBe(25);
    expect(maxDuration).toBe(WIZARD_COMPETITORS_MAX_DURATION_S);
    expect(source.match(/export const maxDuration = 25;/g)).toHaveLength(1);

    await POST(makeRequest({ companyName: "Sajtstudio" }));
    expect(emitWizardRouteTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "competitors",
        outcome: "client_error",
        dominantStage: "validate",
      }),
    );
  });

  it("returns the existing empty payload and a deadline terminal event when the budget fires", async () => {
    raceWizardDeadline.mockRejectedValueOnce(
      Object.assign(new Error("The operation was aborted."), { name: "AbortError" }),
    );

    const response = await POST(makeRequest({ companyName: "Sajtstudio", industry: "Webb" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ competitors: [] });
    expect(generateText).not.toHaveBeenCalled();
    expect(emitWizardRouteTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "competitors",
        outcome: "deadline",
      }),
    );
  });
});
