import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const validateAndNormalizeUrl = vi.hoisted(() => vi.fn());
const getCanonicalUrlKey = vi.hoisted(() => vi.fn());
const scrapeWebsite = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("openai", () => ({ default: vi.fn() }));
vi.mock("@/lib/builder/direct-model", () => ({ createDirectModel: vi.fn() }));
vi.mock("@/lib/credits/server", () => ({ prepareCredits }));
vi.mock("@/lib/credits/pricing", () => ({
  getCreditCost: vi.fn(() => 3),
}));
vi.mock("@/lib/webscraper", () => ({
  validateAndNormalizeUrl,
  getCanonicalUrlKey,
  scrapeWebsite,
}));
vi.mock("@/lib/audit-prompts", () => ({
  buildAuditPrompt: vi.fn(),
  extractFirstJsonObject: vi.fn(),
  parseJsonWithRepair: vi.fn(),
}));
vi.mock("@/lib/config", () => ({
  FEATURES: { useResponsesApi: false },
  SECRETS: { openaiApiKey: "openai-key" },
}));
vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_request: NextRequest, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));
vi.mock("@/lib/gen/defaults", () => ({
  AUDIT_STRUCTURED_DEFAULT_MODEL: "openai/gpt-test",
  AUDIT_STRUCTURED_FALLBACK_MODELS: [],
}));

const { POST } = await import("./route");

function request(body: unknown, userId = "user_1"): NextRequest {
  return new NextRequest("http://localhost/api/audit", {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": userId },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/audit", () => {
  const commit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    validateAndNormalizeUrl.mockImplementation((url: string) =>
      url.includes("www.") ? "https://www.example.com/path" : "https://example.com/",
    );
    getCanonicalUrlKey.mockImplementation((url: string) =>
      url.includes("example.com") ? "example.com" : url,
    );
    prepareCredits.mockImplementation(async (incomingRequest: NextRequest) => ({
      ok: true,
      user: { id: incomingRequest.headers.get("x-test-user") ?? "user_1", diamonds: 10 },
      isTest: true,
      commit,
    }));
  });

  it("rejects invalid JSON before URL and credit work", async () => {
    const response = await POST(request("{"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Ogiltig JSON i förfrågan",
    });
    expect(validateAndNormalizeUrl).not.toHaveBeenCalled();
    expect(prepareCredits).not.toHaveBeenCalled();
  });

  it("rejects invalid URLs before preparing credits", async () => {
    validateAndNormalizeUrl.mockImplementation(() => {
      throw new Error("Ogiltig URL");
    });

    const response = await POST(request({ url: "invalid", auditMode: "basic" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Ogiltig URL" });
    expect(prepareCredits).not.toHaveBeenCalled();
  });

  it("forwards the credit gate response before scraping", async () => {
    prepareCredits.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Insufficient credits" }, { status: 402 }),
    });

    const response = await POST(request({ url: "https://example.com", auditMode: "advanced" }));

    expect(response.status).toBe(402);
    expect(scrapeWebsite).not.toHaveBeenCalled();
  });

  it("scopes canonical duplicate work by user and releases the lock after failure", async () => {
    let rejectFirst!: (reason: Error) => void;
    scrapeWebsite.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );

    const first = POST(request({ url: "https://example.com", auditMode: "basic" }));
    await vi.waitFor(() => expect(scrapeWebsite).toHaveBeenCalledTimes(1));

    const duplicate = await POST(
      request({ url: "https://www.example.com/path?utm_source=test", auditMode: "basic" }),
    );

    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ success: false, duplicate: true });
    expect(scrapeWebsite).toHaveBeenCalledTimes(1);
    expect(validateAndNormalizeUrl).toHaveReturnedWith("https://example.com/");
    expect(validateAndNormalizeUrl).toHaveReturnedWith("https://www.example.com/path");
    expect(getCanonicalUrlKey).toHaveBeenCalledWith("https://example.com/");
    expect(getCanonicalUrlKey).toHaveBeenCalledWith("https://www.example.com/path");

    scrapeWebsite.mockRejectedValueOnce(new Error("Timeout"));
    const otherUser = await POST(
      request(
        { url: "https://www.example.com/path?utm_source=test", auditMode: "basic" },
        "user_2",
      ),
    );

    expect(otherUser.status).toBe(408);
    expect(scrapeWebsite).toHaveBeenCalledTimes(2);

    rejectFirst(new Error("Timeout"));
    expect((await first).status).toBe(408);

    scrapeWebsite.mockRejectedValueOnce(new Error("Timeout"));
    const retry = await POST(request({ url: "https://example.com", auditMode: "basic" }));

    expect(retry.status).toBe(408);
    expect(scrapeWebsite).toHaveBeenCalledTimes(3);
    expect(commit).not.toHaveBeenCalled();
  });
});
