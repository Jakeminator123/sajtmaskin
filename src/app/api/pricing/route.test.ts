import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CREDIT_ACTION_PRICES } from "@/lib/credits/pricing";

const resolvePricingSettings = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/pricing-settings", () => ({
  resolvePricingSettings,
}));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  resolvePricingSettings.mockResolvedValue({
    domainMarkupBasisPoints: 70_000,
    domainUsdToSekOre: 950,
    domain: { markup: 7, usdToSek: 9.5 },
    creditActionPrices: { auditBasic: 20, promptCreate: { premium: 14 } },
    updatedAt: "2026-09-11T00:00:00.000Z",
    updatedBy: "admin_1",
  });
});

describe("public pricing route", () => {
  it("returns effective prices without actor or timestamp", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({
      success: true,
      domain: { markup: 7, usdToSek: 9.5 },
      credits: {
        promptCreate: {
          ...DEFAULT_CREDIT_ACTION_PRICES.promptCreate,
          premium: 14,
        },
        promptRefine: DEFAULT_CREDIT_ACTION_PRICES.promptRefine,
        wizard: DEFAULT_CREDIT_ACTION_PRICES.wizard,
        auditBasic: 20,
        auditAdvanced: DEFAULT_CREDIT_ACTION_PRICES.auditAdvanced,
        deployPreview: DEFAULT_CREDIT_ACTION_PRICES.deployPreview,
        deployProduction: DEFAULT_CREDIT_ACTION_PRICES.deployProduction,
        openclawTip: DEFAULT_CREDIT_ACTION_PRICES.openclawTip,
      },
    });
    expect(json).not.toHaveProperty("updatedAt");
    expect(json).not.toHaveProperty("updatedBy");
    expect(json.credits).not.toHaveProperty("updatedBy");
  });

  it("maps unexpected failures to 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    resolvePricingSettings.mockRejectedValueOnce(new Error("boom"));
    const response = await GET();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Kunde inte hämta prislistan.",
    });
  });
});
