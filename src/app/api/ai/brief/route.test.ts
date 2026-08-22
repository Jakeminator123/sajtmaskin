import { beforeEach, describe, expect, it, vi } from "vitest";

const generateSiteBriefObject = vi.hoisted(() => vi.fn());
const readBriefCache = vi.hoisted(() => vi.fn());
const writeBriefCache = vi.hoisted(() => vi.fn());
const cached = vi.hoisted(() => ({ value: null as null | { json: unknown } }));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      }),
  },
}));
vi.mock("@/lib/bot-protection", () => ({ requireNotBot: () => null }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/tenant", () => ({ getRequestUserId: vi.fn(async () => "user_1") }));
vi.mock("@/lib/utils/debug", () => ({ debugLog: vi.fn(), errorLog: vi.fn() }));
vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend: vi.fn() }));
vi.mock("@/lib/observability/llm-usage", () => ({
  runWithLlmUsageContext: (_context: unknown, fn: () => Promise<Response>) => fn(),
  setLlmUsageContext: vi.fn(),
}));
vi.mock("@/lib/builder/prompt-assist", () => ({
  normalizeAssistModel: (model: string) => model,
}));
vi.mock("@/lib/builder/site-brief-generation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/builder/site-brief-generation")>()),
  generateSiteBriefObject,
  validateBriefModelForHttp: () => null,
}));
vi.mock("@/lib/builder/brief-build-choices-format", () => ({
  formatBriefBuildChoicesForPrompt: () => "Variant hints: dark editorial.",
}));
vi.mock("@/lib/api/ai/brief-cache", () => ({
  buildBriefCacheKey: vi.fn(() => ({ chatId: null, modelId: "gpt-5.4", hash: "cache-key" })),
  readBriefCache,
  writeBriefCache,
}));
vi.mock("@/lib/config", () => ({ FEATURES: { useRedisCache: true } }));
vi.mock("@/lib/observability/metrics", () => ({ incBriefCache: vi.fn() }));

import { buildBriefTrace, buildBriefUserPrompt } from "@/lib/builder/site-brief-generation";
import { POST } from "./route";

describe("POST /api/ai/brief trace identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cached.value = null;
    readBriefCache.mockImplementation(async () => cached.value);
    writeBriefCache.mockImplementation(async (_key: unknown, payload: unknown) => {
      cached.value = { json: payload };
    });
    generateSiteBriefObject.mockImplementation(async (input) => ({
      brief: { projectTitle: "Trace-safe brief" },
      usedSimplified: false,
      provider: "openai",
      normalizedModel: input.normalizedModel,
      trace: buildBriefTrace({
        source: input.source,
        prompt: buildBriefUserPrompt(
          input.prompt,
          input.imageGenerations,
          input.variantHints,
          input.priorDesignContext,
        ),
        modelId: input.normalizedModel,
        imageGenerations: input.imageGenerations,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        extraHashFields: input.extraHashFields,
      }),
    }));
  });

  it("returns identical trace headers on a cache miss and the following hit", async () => {
    const body = {
      prompt: "Bygg en mörk portfoliosajt",
      model: "gpt-5.4",
      imageGenerations: false,
      source: "builder-init",
      buildIntent: "website",
      styleChoiceHint: "editorial",
      colorModeHint: "dark",
    };
    const request = () =>
      new Request("https://example.com/api/ai/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const miss = await POST(request());
    const hit = await POST(request());

    expect(miss.headers.get("X-Brief-Cache")).toBe("miss");
    expect(hit.headers.get("X-Brief-Cache")).toBe("hit");
    expect(hit.headers.get("X-Brief-Trace-Id")).toBe(miss.headers.get("X-Brief-Trace-Id"));
    expect(hit.headers.get("X-Brief-Prompt-Hash")).toBe(miss.headers.get("X-Brief-Prompt-Hash"));
    expect(generateSiteBriefObject).toHaveBeenCalledTimes(1);
  });
});
