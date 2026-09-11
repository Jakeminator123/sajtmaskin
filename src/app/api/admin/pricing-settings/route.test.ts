import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DEFAULT_CREDIT_ACTION_PRICES } from "@/lib/credits/pricing";
import { DEFAULT_DOMAIN_PRICING } from "@/lib/domains/pricing";

const requireAdminAccess = vi.hoisted(() => vi.fn());
const getPricingSettings = vi.hoisted(() => vi.fn());
const updatePricingSettings = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ requireAdminAccess }));
vi.mock("@/lib/db/services/pricing-settings", () => ({
  getPricingSettings,
  updatePricingSettings,
}));

const { GET, PATCH } = await import("./route");

const settings = {
  domainMarkupBasisPoints: 50_000,
  domainUsdToSekOre: 1_100,
  domain: { markup: 5, usdToSek: 11 },
  creditActionPrices: { wizard: 14 },
  updatedAt: "2026-09-11T00:00:00.000Z",
  updatedBy: "admin_1",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminAccess.mockResolvedValue({ ok: true, user: { id: "admin_1" } });
  getPricingSettings.mockResolvedValue(settings);
  updatePricingSettings.mockResolvedValue(settings);
});

describe("admin pricing-settings route", () => {
  it("returns stored overrides, code defaults and effective prices", async () => {
    const response = await GET(new NextRequest("http://localhost/api/admin/pricing-settings"));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.settings.creditActionPrices).toEqual({ wizard: 14 });
    expect(json.defaults.creditActionPrices).toEqual(DEFAULT_CREDIT_ACTION_PRICES);
    expect(json.defaults.domain).toEqual(DEFAULT_DOMAIN_PRICING);
    expect(json.effective.domain).toEqual({ markup: 5, usdToSek: 11 });
    expect(json.defaults.domain.markup).not.toBe(json.effective.domain.markup);
    expect(json.effective.creditActionPrices.wizard).toBe(14);
    expect(json.effective.creditActionPrices.auditBasic).toBe(
      DEFAULT_CREDIT_ACTION_PRICES.auditBasic,
    );
  });

  it("forwards a partial credit patch with the admin actor", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost/api/admin/pricing-settings", {
        method: "PATCH",
        body: JSON.stringify({ creditActionPrices: { wizard: 14 } }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);
    expect(updatePricingSettings).toHaveBeenCalledWith({
      creditActionPrices: { wizard: 14 },
      updatedBy: "admin_1",
    });
    expect(updatePricingSettings.mock.calls[0][0]).not.toHaveProperty("domainMarkup");
    expect(updatePricingSettings.mock.calls[0][0]).not.toHaveProperty("domainUsdToSek");
  });

  it("forwards a single domain field without touching credits", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost/api/admin/pricing-settings", {
        method: "PATCH",
        body: JSON.stringify({ domainMarkup: 6 }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);
    expect(updatePricingSettings).toHaveBeenCalledWith({
      domainMarkup: 6,
      updatedBy: "admin_1",
    });
    expect(updatePricingSettings.mock.calls[0][0]).not.toHaveProperty("creditActionPrices");
  });

  it("rejects a non-numeric domain field before the service runs", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost/api/admin/pricing-settings", {
        method: "PATCH",
        body: JSON.stringify({ domainUsdToSek: "nej" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(400);
    expect(updatePricingSettings).not.toHaveBeenCalled();
  });

  it("maps RangeError to 400", async () => {
    updatePricingSettings.mockRejectedValueOnce(new RangeError("Domänpåslaget måste vara mellan X1,0 och X10,0."));
    const response = await PATCH(
      new NextRequest("http://localhost/api/admin/pricing-settings", {
        method: "PATCH",
        body: JSON.stringify({ domainMarkup: 20 }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Domänpåslaget måste vara mellan X1,0 och X10,0.",
    });
  });

  it("does not read settings when admin access is denied", async () => {
    requireAdminAccess.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403,
      }),
    });
    const response = await GET(new NextRequest("http://localhost/api/admin/pricing-settings"));
    expect(response.status).toBe(403);
    expect(getPricingSettings).not.toHaveBeenCalled();
  });

  it("does not write settings when admin access is denied", async () => {
    requireAdminAccess.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403,
      }),
    });
    const response = await PATCH(
      new NextRequest("http://localhost/api/admin/pricing-settings", {
        method: "PATCH",
        body: JSON.stringify({ creditActionPrices: { wizard: 14 } }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(403);
    expect(updatePricingSettings).not.toHaveBeenCalled();
  });

  it("maps other errors to 500 with a Swedish message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getPricingSettings.mockRejectedValueOnce(new Error("connection reset"));
    const response = await GET(new NextRequest("http://localhost/api/admin/pricing-settings"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Kunde inte hämta prisinställningarna.",
    });
  });
});
