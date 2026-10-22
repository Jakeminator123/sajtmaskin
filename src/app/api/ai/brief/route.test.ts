import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateSiteBriefObject = vi.hoisted(() => vi.fn());
const flushPendingUsageWrites = vi.hoisted(() => vi.fn());
const useRedisCache = vi.hoisted(() => ({ value: false }));
const readBriefCache = vi.hoisted(() => vi.fn());
const writeBriefCache = vi.hoisted(() => vi.fn());
const hasRecordedBriefUsageClaim = vi.hoisted(() => vi.fn());
const createLlmUsageRecord = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ dbConfigured: true, db: {} }));
vi.mock("@/lib/db/services/llm-usage", () => ({ hasRecordedBriefUsageClaim, createLlmUsageRecord }));
vi.mock("@/lib/bot-protection", () => ({ requireNotBot: () => null }));
vi.mock("@/lib/rate-limit", () => ({ withRateLimit: (_req: Request, _key: string, run: () => unknown) => run() }));
vi.mock("@/lib/tenant", () => ({ getRequestUserId: async () => "user-1" }));
vi.mock("@/lib/config", () => ({ FEATURES: { get useRedisCache() { return useRedisCache.value; } } }));
vi.mock("@/lib/utils/debug", () => ({ debugLog: vi.fn(), errorLog: vi.fn() }));
vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend: vi.fn() }));
vi.mock("@/lib/observability/metrics", () => ({ incBriefCache: vi.fn() }));
vi.mock("@/lib/api/ai/brief-cache", () => ({
  buildBriefCacheKey: () => ({ chatId: null, modelId: "gpt-5.6-sol" }), readBriefCache, writeBriefCache,
}));
vi.mock("@/lib/observability/llm-usage", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/observability/llm-usage")>(), flushPendingUsageWrites,
}));
vi.mock("@/lib/builder/site-brief-generation", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/builder/site-brief-generation")>(),
  generateSiteBriefObject, validateBriefModelForHttp: () => null,
}));

import { getLlmUsageContext } from "@/lib/observability/llm-usage";
import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/ai/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "Testfika", model: "gpt-5.6-sol" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  useRedisCache.value = false;
  flushPendingUsageWrites.mockResolvedValue(undefined);
  readBriefCache.mockResolvedValue(null);
  writeBriefCache.mockReset().mockResolvedValue(undefined);
  hasRecordedBriefUsageClaim.mockResolvedValue(true);
  createLlmUsageRecord.mockReset();
  generateSiteBriefObject.mockImplementation(async () => ({
    brief: { projectTitle: "Testfika" }, provider: "openai", reasoningSummary: null,
    trace: { source: "test", traceId: "trace-1", promptHash: "prompt-hash" },
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("brief cost receipt", () => {
  it("cannot turn a rejected receipt into an unbilled cache hit on the next request", async () => {
    useRedisCache.value = true;
    let cached: unknown = null;
    readBriefCache.mockImplementation(async () => cached ? { json: cached } : null);
    writeBriefCache.mockImplementation(async (_key, payload) => { cached = payload; });
    hasRecordedBriefUsageClaim.mockResolvedValueOnce(false).mockResolvedValue(true);
    const first = await POST(request());
    expect(first.status).toBe(503);
    expect(writeBriefCache).not.toHaveBeenCalled();
    const second = await POST(request());
    expect(second.status).toBe(200);
    expect(second.headers.get("X-Brief-Usage-Claim-Key")).toBeTruthy();
    expect(generateSiteBriefObject).toHaveBeenCalledTimes(2);
    expect(hasRecordedBriefUsageClaim.mock.invocationCallOrder[1]).toBeLessThan(writeBriefCache.mock.invocationCallOrder[0]!);
    const third = await POST(request());
    expect(third.headers.get("X-Brief-Cache")).toBe("hit");
    expect(third.headers.get("X-Brief-Usage-Claim-Key")).toBeNull();
    expect(generateSiteBriefObject).toHaveBeenCalledTimes(2);
  });

  it("returns the actual request claim only after its usage writes have drained", async () => {
    let actualClaim: string | null | undefined;
    let release!: () => void;
    flushPendingUsageWrites.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    generateSiteBriefObject.mockImplementation(async () => {
      actualClaim = getLlmUsageContext().claimKey;
      return { brief: { projectTitle: "Testfika" }, provider: "openai", trace: { source: "test", traceId: "trace-1", promptHash: "hash" } };
    });
    let responded = false;
    const pending = POST(request()).then(response => { responded = true; return response; });
    await vi.waitFor(() => expect(flushPendingUsageWrites).toHaveBeenCalledOnce());
    expect(responded).toBe(false);
    release();
    const response = await pending;
    expect(response.status).toBe(200);
    expect(actualClaim).toMatch(/^[a-f0-9-]{36}$/);
    expect(response.headers.get("X-Brief-Usage-Claim-Key")).toBe(actualClaim);
    expect(hasRecordedBriefUsageClaim).toHaveBeenCalledWith("user-1", actualClaim);
    expect(await response.json()).toEqual({ projectTitle: "Testfika" });
  });

  it("rejects a missing receipt even when the real best-effort insert swallows its failure and flush resolves", async () => {
    vi.stubEnv("POSTGRES_URL", "postgres://offline-fixture/billing");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const actualUsage = await vi.importActual<typeof import("@/lib/observability/llm-usage")>("@/lib/observability/llm-usage");
    flushPendingUsageWrites.mockImplementation(actualUsage.flushPendingUsageWrites);
    createLlmUsageRecord.mockRejectedValue(new Error("insert failed"));
    hasRecordedBriefUsageClaim.mockResolvedValue(false);
    generateSiteBriefObject.mockImplementation(async () => {
      actualUsage.recordLlmUsage({ phase: "brief", model: "gpt-5.6-sol", usage: { inputTokens: 10, outputTokens: 1 } });
      return { brief: { projectTitle: "Testfika" }, provider: "openai", trace: { source: "test", traceId: "trace", promptHash: "hash" } };
    });
    const response = await POST(request());
    expect(createLlmUsageRecord).toHaveBeenCalledOnce();
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Brief-Usage-Claim-Key")).toBeNull();
    expect(await response.json()).toMatchObject({ code: "brief_usage_unavailable" });
  });

  it("also refuses a receipt if its ownership lookup fails", async () => {
    hasRecordedBriefUsageClaim.mockRejectedValue(new Error("lookup failed"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Brief-Usage-Claim-Key")).toBeNull();
  });

  it("never returns a paid receipt or starts a model for a shared cache hit", async () => {
    useRedisCache.value = true;
    readBriefCache.mockResolvedValue({ json: { brief: { projectTitle: "Cached café" }, provider: "openai", briefQuality: "full" } });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Brief-Usage-Claim-Key")).toBeNull();
    expect(generateSiteBriefObject).not.toHaveBeenCalled();
    expect(flushPendingUsageWrites).not.toHaveBeenCalled();
  });
});
