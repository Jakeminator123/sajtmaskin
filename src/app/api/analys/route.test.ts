import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AuditResult } from "@/types/audit";

const validateAndNormalizeUrl = vi.hoisted(() => vi.fn());
const getCanonicalUrlKey = vi.hoisted(() => vi.fn());
const runWebsiteAudit = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const withRateLimit = vi.hoisted(() =>
  vi.fn(
    (_request: NextRequest, bucket: string, handler: () => Promise<Response>) => {
      expect(bucket).toBe("analys:public");
      return handler();
    },
  ),
);

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
vi.mock("@/lib/rate-limit", () => ({ withRateLimit }));
vi.mock("@/app/api/audit/modules/in-flight", () => {
  const inFlightAudits = new Map();
  return { inFlightAudits };
});

const { POST } = await import("./route");

/** Full internal result; the route must only forward the public projection. */
const engineResult = {
  audit_type: "website_audit",
  audit_mode: "basic",
  company: "Example",
  domain: "example.com",
  audit_scores: { seo: 71, security: 40 },
  improvements: [{ item: "Skriv om startsidan", impact: "high", effort: "low" }],
  site_content: { company_name: "Example", description: "hemlig extraktion", sections: [] },
  template_data: { generation_prompt: "superprompt", must_have_sections: [], style_notes: "", improvements_to_apply: [] },
  color_theme: { primary_color: "#fff", background_color: "#000", text_color: "#fff", theme_type: "dark", style_description: "x" },
  budget_estimate: { currency: "SEK", low: 10000, high: 50000 },
  cost: { tokens: 1234, sek: 0.13, usd: 0.0121 },
} as unknown as AuditResult;

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
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    validateAndNormalizeUrl.mockImplementation(() => "https://example.com/");
    getCanonicalUrlKey.mockReturnValue("example.com");
    withRateLimit.mockImplementation(
      (_request: NextRequest, bucket: string, handler: () => Promise<Response>) => {
        expect(bucket).toBe("analys:public");
        return handler();
      },
    );
    runWebsiteAudit.mockResolvedValue({
      ok: true,
      result: engineResult,
      usedFallback: false,
      usedModel: "openai/gpt-5.6-luna",
    });
  });

  it("rejects invalid JSON without spending the daily quota", async () => {
    const response = await POST(request("{"));
    expect(response.status).toBe(400);
    expect(withRateLimit).not.toHaveBeenCalled();
    expect(runWebsiteAudit).not.toHaveBeenCalled();
    expect(prepareCredits).not.toHaveBeenCalled();
  });

  it("rejects invalid URLs before the rate limiter", async () => {
    validateAndNormalizeUrl.mockImplementation(() => {
      throw new Error("Ogiltig URL");
    });
    const response = await POST(request({ url: "nope" }));
    expect(response.status).toBe(400);
    expect(withRateLimit).not.toHaveBeenCalled();
    expect(runWebsiteAudit).not.toHaveBeenCalled();
  });

  it("rejects an oversized url string before the rate limiter", async () => {
    const response = await POST(request({ url: `https://example.com/${"a".repeat(4000)}` }));
    expect(response.status).toBe(400);
    expect(withRateLimit).not.toHaveBeenCalled();
  });

  it("rejects private/internal targets (SSRF defence in depth)", async () => {
    validateAndNormalizeUrl.mockImplementation(() => "http://127.0.0.1/admin");
    const response = await POST(request({ url: "127.0.0.1" }));
    expect(response.status).toBe(400);
    expect(withRateLimit).not.toHaveBeenCalled();
    expect(runWebsiteAudit).not.toHaveBeenCalled();
  });

  it("runs the public prompt profile without charging credits", async () => {
    const response = await POST(request({ url: "https://example.com" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.surface).toBe("public-analys");
    expect(payload.report.company).toBe("Example");
    expect(prepareCredits).not.toHaveBeenCalled();
    expect(runWebsiteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedUrl: "https://example.com/",
        promptKind: "public",
        auditMode: "basic",
      }),
    );
  });

  it("never leaks the internal audit payload to an anonymous caller", async () => {
    const response = await POST(request({ url: "https://example.com" }));
    const payload = await response.json();

    expect(payload.result).toBeUndefined();
    expect(payload.usedModel).toBeUndefined();
    expect(payload.report.site_content).toBeUndefined();
    expect(payload.report.template_data).toBeUndefined();
    expect(payload.report.color_theme).toBeUndefined();
    expect(payload.report.budget_estimate).toBeUndefined();
    expect(payload.report.cost).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("superprompt");
  });

  it("marks the guest report as private and non-indexable", async () => {
    const response = await POST(request({ url: "https://example.com" }));
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });

  it("propagates engine failures with the engine status", async () => {
    runWebsiteAudit.mockResolvedValue({ ok: false, status: 502, error: "Scrape misslyckades" });
    const response = await POST(request({ url: "https://example.com" }));
    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toBe("Scrape misslyckades");
  });
});
