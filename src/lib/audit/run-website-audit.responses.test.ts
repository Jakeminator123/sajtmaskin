import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIConnectionError, APIUserAbortError } from "openai";
import { AUDIT_ADVANCED_ONLY_FIELDS, resolveAuditRun } from "@/lib/audit/audit-tier";

const responsesCreate = vi.hoisted(() => vi.fn());
const openAIConstructor = vi.hoisted(() => vi.fn());
const scrapeWebsite = vi.hoisted(() => vi.fn());

vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openai")>();
  const MockOpenAI = Object.assign(
    function MockOpenAI(options: unknown) {
      openAIConstructor(options);
      return { responses: { create: responsesCreate } };
    },
    {
      APIConnectionError: actual.APIConnectionError,
      APIUserAbortError: actual.APIUserAbortError,
    },
  );
  return { ...actual, default: MockOpenAI };
});

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/builder/direct-model", () => ({ createDirectModel: vi.fn() }));
vi.mock("@/lib/webscraper", () => ({ scrapeWebsite }));
vi.mock("@/lib/config", () => ({
  FEATURES: { useResponsesApi: true },
  SECRETS: { openaiApiKey: "test-key" },
}));
const { runWebsiteAudit } = await import("./run-website-audit");

const websiteContent = {
  title: "Example",
  description: "Example description",
  wordCount: 300,
  hasSSL: true,
  headings: ["Example", "Services"],
  meta: { viewport: "width=device-width" },
  links: { internal: 3, external: 1 },
  images: 2,
  imageCandidates: [],
  responseTime: 120,
  sampledUrls: ["https://example.com/"],
  url: "https://example.com/",
};

function successfulResponse(options?: {
  outputText?: string;
  inputTokens?: number;
  outputTokens?: number;
  webSearchCalls?: number;
  status?: string;
  error?: { code: string; message: string } | null;
  incompleteDetails?: { reason: string } | null;
}) {
  return {
    status: options?.status ?? "completed",
    error: options?.error ?? null,
    incomplete_details: options?.incompleteDetails ?? null,
    output_text:
      options?.outputText ??
      JSON.stringify({
        company: "Example",
        audit_scores: { seo: 80 },
        improvements: [{ item: "Improve headings", why: "Clarity", how: "Use H2" }],
      }),
    output: Array.from({ length: options?.webSearchCalls ?? 0 }, () => ({
      type: "web_search_call",
    })),
    usage: {
      input_tokens: options?.inputTokens ?? 10,
      output_tokens: options?.outputTokens ?? 5,
    },
  };
}

function runPublic(requestStartTime = Date.now()) {
  return runWebsiteAudit({
    normalizedUrl: "https://example.com/",
    auditMode: "basic",
    promptKind: "public",
    requestId: "responses-test",
    requestStartTime,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  responsesCreate.mockReset();
  openAIConstructor.mockReset();
  scrapeWebsite.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  scrapeWebsite.mockResolvedValue(websiteContent);
  responsesCreate.mockResolvedValue(successfulResponse());
});

describe("runWebsiteAudit Responses fallback", () => {
  it.each([
    { promptKind: "product", auditMode: "basic" },
    { promptKind: "product", auditMode: "advanced" },
    { promptKind: "public", auditMode: "basic" },
    { promptKind: "public", auditMode: "advanced" },
  ] as const)("applies the resolved $promptKind/$auditMode tier through the real pipeline", async (input) => {
    const tier = resolveAuditRun(input);
    const advancedFields = {
      business_profile: { industry: "Design" },
      market_context: { primary_geography: "Sweden" },
      customer_segments: { primary_segment: "Small businesses" },
      competitive_landscape: { positioning: "Local specialist" },
      competitor_insights: { industry_standards: "Accessible websites" },
    };
    responsesCreate.mockResolvedValueOnce(successfulResponse({
      outputText: JSON.stringify({ company: "Example", ...advancedFields }),
    }));

    const result = await runWebsiteAudit({
      ...input,
      normalizedUrl: "https://example.com/",
      requestId: "tier-behavior",
      requestStartTime: Date.now(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a successful audit");
    expect(scrapeWebsite).toHaveBeenCalledWith("https://example.com/", { maxPages: tier.maxPages });
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    const request = responsesCreate.mock.calls[0][0];
    expect(request.model).toBe(tier.modelCandidates[0].replace(/^openai\//, ""));
    expect(request.text.format.schema).toEqual(tier.schema);
    expect(request.tools).toEqual(tier.allowWebSearch
      ? [{ type: "web_search_preview", search_context_size: "low" }]
      : undefined);
    expect(request.input[0].content).toContain(websiteContent.description);
    expect(result.result.audit_mode).toBe(tier.mode);
    expect(result.result.company).toBe("Example");
    for (const field of AUDIT_ADVANCED_ONLY_FIELDS) {
      if (tier.schemaKind === "core") expect(result.result).not.toHaveProperty(field);
      else expect(result.result[field]).toEqual(advancedFields[field]);
    }
    const costLine = vi.mocked(console.info).mock.calls
      .map(([message]) => String(message))
      .find((message) => message.includes("Audit cost summary:"));
    expect(costLine).toContain(`mode=${tier.mode}`);
    expect(costLine).toContain(`pages=${tier.maxPages}`);
    expect(costLine).toContain(`web_search=${tier.allowWebSearch}`);
    expect(costLine).toContain(`model=${result.usedModel}`);
  });

  it("uses SDK retries zero and the manifest primary model with a bounded request timeout", async () => {
    const result = await runPublic();
    const candidates = resolveAuditRun({
      promptKind: "public",
      auditMode: "basic",
    }).modelCandidates;

    expect(result.ok).toBe(true);
    expect(openAIConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "test-key", maxRetries: 0 }),
    );
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    expect(responsesCreate.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ model: candidates[0].replace(/^openai\//, "") }),
    );
    expect(responsesCreate.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        maxRetries: 0,
        timeout: expect.any(Number),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(responsesCreate.mock.calls[0]?.[1].timeout).toBeGreaterThan(85_000);
    expect(responsesCreate.mock.calls[0]?.[1].timeout).toBeLessThanOrEqual(90_000);
  });

  it("caps each request by the remaining 270 second total deadline", async () => {
    const result = await runPublic(Date.now() - 260_000);
    expect(result.ok).toBe(true);
    expect(responsesCreate.mock.calls[0]?.[1].timeout).toBeGreaterThan(8_000);
    expect(responsesCreate.mock.calls[0]?.[1].timeout).toBeLessThanOrEqual(10_000);
  });

  it("does not call a provider when scraping has consumed the total deadline", async () => {
    const result = await runPublic(Date.now() - 270_001);

    expect(result).toEqual(expect.objectContaining({ ok: false, status: 502 }));
    expect(responsesCreate).not.toHaveBeenCalled();
  });

  it("falls back across exactly the two manifest candidates for a transient error", async () => {
    responsesCreate
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValueOnce(successfulResponse());
    const candidates = resolveAuditRun({
      promptKind: "public",
      auditMode: "basic",
    }).modelCandidates;

    const result = await runPublic();

    expect(candidates).toHaveLength(2);
    expect(result).toEqual(expect.objectContaining({ ok: true, usedModel: candidates[1] }));
    expect(responsesCreate).toHaveBeenCalledTimes(2);
    expect(responsesCreate.mock.calls.map((call) => call[0].model)).toEqual(
      candidates.map((candidate) => candidate.replace(/^openai\//, "")),
    );
  });

  it.each([
    Object.assign(new Error("request timeout"), { status: 408 }),
    Object.assign(new Error("socket reset"), { code: "ECONNRESET" }),
  ])("falls back for classified timeout/reset failures", async (error) => {
    responsesCreate.mockRejectedValueOnce(error).mockResolvedValueOnce(successfulResponse());

    expect((await runPublic()).ok).toBe(true);
    expect(responsesCreate).toHaveBeenCalledTimes(2);
  });

  it("falls back for explicit model_not_found", async () => {
    responsesCreate
      .mockRejectedValueOnce(
        Object.assign(new Error("missing model"), { status: 404, code: "model_not_found" }),
      )
      .mockResolvedValueOnce(successfulResponse());

    const result = await runPublic();
    expect(result.ok).toBe(true);
    expect(responsesCreate).toHaveBeenCalledTimes(2);
  });

  it.each([
    [400, "invalid_json_schema"],
    [400, "context_length_exceeded"],
    [400, "content_policy_violation"],
    [401, "invalid_api_key"],
    [402, "billing_required"],
    [403, "permission_denied"],
    [404, "resource_not_found"],
  ])("does not fallback for non-transient status %s code %s", async (status, code) => {
    responsesCreate.mockRejectedValue(Object.assign(new Error(code), { status, code }));

    await expect(runPublic()).rejects.toMatchObject({ status, code });
    expect(responsesCreate).toHaveBeenCalledTimes(1);
  });

  it.each(["insufficient_quota", "billing_hard_limit_reached"])(
    "does not fallback for hard 429 quota code %s",
    async (code) => {
      responsesCreate.mockRejectedValue(Object.assign(new Error(code), { status: 429, code }));

      await expect(runPublic()).rejects.toMatchObject({ status: 429, code });
      expect(responsesCreate).toHaveBeenCalledTimes(1);
    },
  );

  it("honors Retry-After before trying the second model", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T12:00:00.000Z"));
    responsesCreate
      .mockRejectedValueOnce(
        Object.assign(new Error("rate limited"), {
          status: 429,
          headers: new Headers({ "retry-after": "2" }),
        }),
      )
      .mockResolvedValueOnce(successfulResponse());

    const pending = runPublic(Date.now());
    await vi.advanceTimersByTimeAsync(0);
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect((await pending).ok).toBe(true);
    expect(responsesCreate).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not retry before a Retry-After that exceeds the remaining total budget", async () => {
    responsesCreate.mockRejectedValue(
      Object.assign(new Error("rate limited"), {
        status: 429,
        headers: { "retry-after": "300" },
      }),
    );

    const result = await runPublic();
    expect(result).toEqual(expect.objectContaining({ ok: false, status: 502 }));
    expect(responsesCreate).toHaveBeenCalledTimes(1);
  });

  it("falls back when the SDK wraps the owned body-timeout signal", async () => {
    const controllers: AbortController[] = [];
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const controller = new AbortController();
      controllers.push(controller);
      return controller.signal;
    });
    responsesCreate
      .mockImplementationOnce(
        (_body: unknown, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              "abort",
              () => reject(new APIUserAbortError()),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce(successfulResponse());

    const pending = runPublic(Date.now() - 260_000);
    await vi.waitFor(() => expect(responsesCreate).toHaveBeenCalledTimes(1));
    const firstOptions = responsesCreate.mock.calls[0]?.[1] as {
      timeout: number;
      signal: AbortSignal;
    };
    expect(firstOptions.signal).toBe(controllers[0].signal);
    expect(timeoutSpy).toHaveBeenNthCalledWith(1, firstOptions.timeout);
    controllers[0].abort(new DOMException("The operation timed out", "TimeoutError"));

    expect((await pending).ok).toBe(true);
    expect(responsesCreate).toHaveBeenCalledTimes(2);
  });

  it("falls back for a native AbortError only when the owned timeout expired", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    responsesCreate
      .mockImplementationOnce(
        (_body: unknown, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              "abort",
              () => reject(Object.assign(new Error("body aborted"), { name: "AbortError" })),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce(successfulResponse());

    const pending = runPublic(Date.now() - 260_000);
    await vi.waitFor(() => expect(responsesCreate).toHaveBeenCalledTimes(1));
    controller.abort(new DOMException("The operation timed out", "TimeoutError"));

    expect((await pending).ok).toBe(true);
    expect(responsesCreate).toHaveBeenCalledTimes(2);
  });

  it("does not fallback when an SDK abort wrapper has no expired owned signal", async () => {
    const error = new APIUserAbortError();
    responsesCreate.mockRejectedValue(error);

    await expect(runPublic()).rejects.toBe(error);
    expect(responsesCreate).toHaveBeenCalledTimes(1);
  });

  it("does not fallback when the attempt signal was cancelled for a non-timeout reason", async () => {
    const controller = new AbortController();
    const error = new APIUserAbortError();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    responsesCreate.mockImplementationOnce(
      (_body: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(error), { once: true });
        }),
    );

    const pending = runPublic();
    await vi.waitFor(() => expect(responsesCreate).toHaveBeenCalledTimes(1));
    controller.abort(new DOMException("Caller cancelled", "AbortError"));

    await expect(pending).rejects.toBe(error);
    expect(responsesCreate).toHaveBeenCalledTimes(1);
  });

  it("falls back for the SDK's generic connection wrapper", async () => {
    responsesCreate
      .mockRejectedValueOnce(new APIConnectionError({}))
      .mockResolvedValueOnce(successfulResponse());

    expect((await runPublic()).ok).toBe(true);
    expect(responsesCreate).toHaveBeenCalledTimes(2);
  });

  it("returns 502 after both transient candidates are exhausted", async () => {
    responsesCreate.mockRejectedValue(Object.assign(new Error("upstream failed"), { status: 503 }));

    const result = await runPublic();
    expect(result).toEqual({
      ok: false,
      status: 502,
      error: "Auditens modellkedja kunde inte generera ett svar.",
    });
    expect(responsesCreate).toHaveBeenCalledTimes(2);
  });

  it("falls back on an empty primary and aggregates completed-response usage by model", async () => {
    responsesCreate
      .mockResolvedValueOnce(
        successfulResponse({
          outputText: "",
          inputTokens: 100,
          outputTokens: 50,
          webSearchCalls: 1,
        }),
      )
      .mockResolvedValueOnce(
        successfulResponse({ inputTokens: 200, outputTokens: 100, webSearchCalls: 2 }),
      );
    const candidates = resolveAuditRun({
      promptKind: "public",
      auditMode: "basic",
    }).modelCandidates;

    const result = await runPublic();
    if (!result.ok) throw new Error("expected success");

    expect(result.usedModel).toBe(candidates[1]);
    expect(result.result.cost).toEqual({ tokens: 450, usd: 0.0015, sek: 0.02 });
    expect(result.result.scrape_summary?.web_search_calls).toBe(3);
    expect(responsesCreate).toHaveBeenCalledTimes(2);
  });

  it("does not accept parsable partial JSON from an incomplete response", async () => {
    responsesCreate
      .mockResolvedValueOnce(
        successfulResponse({
          status: "incomplete",
          incompleteDetails: { reason: "max_output_tokens" },
          inputTokens: 100,
          outputTokens: 50,
        }),
      )
      .mockResolvedValueOnce(successfulResponse({ inputTokens: 20, outputTokens: 10 }));
    const candidates = resolveAuditRun({
      promptKind: "public",
      auditMode: "basic",
    }).modelCandidates;

    const result = await runPublic();
    if (!result.ok) throw new Error("expected fallback candidate success");

    expect(responsesCreate).toHaveBeenCalledTimes(2);
    expect(result.usedModel).toBe(candidates[1]);
    expect(result.result.cost.tokens).toBe(180);
  });

  it.each(["server_error", "rate_limit_exceeded"])(
    "tries the second model for terminal transient response error %s",
    async (code) => {
      responsesCreate
        .mockResolvedValueOnce(
          successfulResponse({
            status: "failed",
            error: { code, message: "transient provider failure" },
          }),
        )
        .mockResolvedValueOnce(successfulResponse());

      expect((await runPublic()).ok).toBe(true);
      expect(responsesCreate).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    ["failed", { code: "invalid_prompt", message: "bad prompt" }, null],
    ["failed", { code: "bio_policy", message: "policy" }, null],
    ["incomplete", null, { reason: "content_filter" }],
  ])(
    "fails without another model for permanent provider response status %s",
    async (status, error, incompleteDetails) => {
      responsesCreate.mockResolvedValue(
        successfulResponse({ status, error, incompleteDetails }),
      );

      expect(await runPublic()).toEqual(expect.objectContaining({ ok: false, status: 502 }));
      expect(responsesCreate).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["in_progress", "queued", "cancelled", "future_status"])(
    "fails closed without a second paid call for uncertain status %s",
    async (status) => {
      responsesCreate.mockResolvedValue(successfulResponse({ status }));

      expect(await runPublic()).toEqual(expect.objectContaining({ ok: false, status: 502 }));
      expect(responsesCreate).toHaveBeenCalledTimes(1);
    },
  );

  it("fails closed when the provider response has no explicit status", async () => {
    const responseWithoutStatus: Partial<ReturnType<typeof successfulResponse>> =
      successfulResponse();
    delete responseWithoutStatus.status;
    responsesCreate.mockResolvedValue(responseWithoutStatus);

    expect(await runPublic()).toEqual(expect.objectContaining({ ok: false, status: 502 }));
    expect(responsesCreate).toHaveBeenCalledTimes(1);
  });

  it("uses deterministic fallback for invalid JSON without another paid call", async () => {
    responsesCreate.mockResolvedValue(successfulResponse({ outputText: "not-json" }));

    const result = await runPublic();
    expect(result).toEqual(expect.objectContaining({ ok: true, usedFallback: true }));
    expect(responsesCreate).toHaveBeenCalledTimes(1);
  });
});
