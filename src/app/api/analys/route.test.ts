import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const validateAndNormalizeUrl = vi.hoisted(() => vi.fn());
const getCanonicalUrlKey = vi.hoisted(() => vi.fn());
const runWebsiteAudit = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());

vi.mock("@/lib/webscraper", () => ({
  validateAndNormalizeUrl,
  getCanonicalUrlKey,
}));
vi.mock("@/lib/audit/run-website-audit", () => ({
  runWebsiteAudit,
  mapWebsiteAuditException: () => ({
    ok: false as const,
    status: 500,
    error: "Ett fel uppstod vid analysen. Försök igen senare.",
  }),
}));
vi.mock("@/lib/credits/server", () => ({ prepareCredits }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: NextRequest, bucket: string, handler: () => Promise<Response>) => {
    expect(bucket).toBe("analys:public");
    return handler();
  },
}));
vi.mock("@/app/api/audit/modules/in-flight", () => {
  const inFlightAudits = new Map();
  return { inFlightAudits };
});

const { POST } = await import("./route");

describe("analys route configuration", () => {
  it("keeps maxDuration as a direct literal export in the route module", () => {
    const source = readFileSync(resolve("src/app/api/analys/route.ts"), "utf8");
    expect(source.match(/export const maxDuration = 300;/g)).toHaveLength(1);
    expect(source).not.toMatch(/prepareCredits/);
  });
});

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/analys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/analys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    validateAndNormalizeUrl.mockImplementation(() => "https://example.com/");
    getCanonicalUrlKey.mockReturnValue("example.com");
    runWebsiteAudit.mockResolvedValue({
      ok: true,
      result: { company: "Example", domain: "example.com", cost: { tokens: 1, sek: 0, usd: 0 } },
      usedFallback: false,
      usedModel: "openai/gpt-5.6-luna",
    });
  });

  it("rejects invalid JSON without calling the engine", async () => {
    const response = await POST(request("{"));
    expect(response.status).toBe(400);
    expect(runWebsiteAudit).not.toHaveBeenCalled();
    expect(prepareCredits).not.toHaveBeenCalled();
  });

  it("rejects invalid URLs before the engine", async () => {
    validateAndNormalizeUrl.mockImplementation(() => {
      throw new Error("Ogiltig URL");
    });
    const response = await POST(request({ url: "nope" }));
    expect(response.status).toBe(400);
    expect(runWebsiteAudit).not.toHaveBeenCalled();
  });

  it("runs the public prompt profile without charging credits", async () => {
    const response = await POST(request({ url: "https://example.com" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.surface).toBe("public-analys");
    expect(payload.usedModel).toBe("openai/gpt-5.6-luna");
    expect(payload.result.company).toBe("Example");
    expect(response.headers.get("X-Audit-Model")).toBe("openai/gpt-5.6-luna");
    expect(prepareCredits).not.toHaveBeenCalled();
    expect(runWebsiteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedUrl: "https://example.com/",
        promptKind: "public",
        auditMode: "basic",
      }),
    );
  });
});
