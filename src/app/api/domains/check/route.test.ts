import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const resolveDomainOffer = vi.hoisted(() => vi.fn());
const resolvePricingSettings = vi.hoisted(() => vi.fn());
const lookupWhois = vi.hoisted(() => vi.fn());

vi.mock("@/lib/domains/registrar", () => ({ resolveDomainOffer }));
vi.mock("@/lib/db/services/pricing-settings", () => ({ resolvePricingSettings }));
vi.mock("@/lib/domains/rdap-client", () => ({
  lookupWhois,
  summarizeWhois: vi.fn(),
}));
vi.mock("@/lib/vercel/vercel-client", () => ({ isVercelConfigured: vi.fn(() => false) }));
vi.mock("@/lib/loopia/loopia-client", () => ({ isLoopiaConfigured: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/domains/check", () => {
  it.each([null, [], { query: 42 }])("rejects an invalid payload before provider work: %j", async (body) => {
    const response = await POST(
      new NextRequest("http://localhost/api/domains/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(400);
    expect(resolvePricingSettings).not.toHaveBeenCalled();
    expect(resolveDomainOffer).not.toHaveBeenCalled();
    expect(lookupWhois).not.toHaveBeenCalled();
  });

  it.each(["bad domain", "-invalid", "x".repeat(254)])(
    "rejects an invalid domain query before provider work: %s",
    async (query) => {
      const response = await POST(
        new NextRequest("http://localhost/api/domains/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        }),
      );

      expect(response.status).toBe(400);
      expect(resolvePricingSettings).not.toHaveBeenCalled();
      expect(resolveDomainOffer).not.toHaveBeenCalled();
      expect(lookupWhois).not.toHaveBeenCalled();
    },
  );

  it("does not expose pricing or provider failures", async () => {
    resolvePricingSettings.mockRejectedValue(new Error("postgres://secret-host"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await POST(
        new NextRequest("http://localhost/api/domains/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "example.com" }),
        }),
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Domain check failed" });
    } finally {
      error.mockRestore();
    }
  });
});
