import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const resolvePricingSettings = vi.hoisted(() => vi.fn());
const getDomainPrice = vi.hoisted(() => vi.fn());
const checkDomainAvailability = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/pricing-settings", () => ({ resolvePricingSettings }));
vi.mock("@/lib/vercel/vercel-client", () => ({
  getDomainPrice,
  checkDomainAvailability,
  isVercelConfigured: () => false,
}));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: Request, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  resolvePricingSettings.mockResolvedValue({
    domain: { markup: 2, usdToSek: 10 },
  });
});

describe("GET /api/vercel/domains/price", () => {
  it("rejects an oversized domain before pricing work", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/vercel/domains/price?domain=${"x".repeat(254)}`),
    );

    expect(response.status).toBe(400);
    expect(resolvePricingSettings).not.toHaveBeenCalled();
  });

  it.each(["bad_label.example", "example.com:443", "-bad.example"])(
    "rejects an invalid domain before pricing work: %s",
    async (domain) => {
      const response = await GET(
        new NextRequest(`http://localhost/api/vercel/domains/price?domain=${encodeURIComponent(domain)}`),
      );

      expect(response.status).toBe(400);
      expect(resolvePricingSettings).not.toHaveBeenCalled();
      expect(getDomainPrice).not.toHaveBeenCalled();
    },
  );

  it("does not expose pricing storage failures", async () => {
    resolvePricingSettings.mockRejectedValue(new Error("postgres://secret-host"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await GET(
        new NextRequest("http://localhost/api/vercel/domains/price?domain=example.com"),
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        success: false,
        error: "Domain price lookup failed",
      });
    } finally {
      error.mockRestore();
    }
  });
});
