import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAdminAccess = vi.hoisted(() => vi.fn());
const getGenerationBillingAdminData = vi.hoisted(() => vi.fn());
const updateGenerationBillingSettings = vi.hoisted(() => vi.fn());
const reconcilePendingGenerationBillings = vi.hoisted(() => vi.fn());
const fetchOpenAiOrganizationCosts = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ requireAdminAccess }));
vi.mock("@/lib/db/services/generation-billing", () => ({
  getGenerationBillingAdminData,
  reconcilePendingGenerationBillings,
  updateGenerationBillingSettings,
}));
vi.mock("@/lib/openai/organization-costs", () => ({ fetchOpenAiOrganizationCosts }));

const { GET, PATCH, POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminAccess.mockResolvedValue({ ok: true, user: { id: "admin_1" } });
  fetchOpenAiOrganizationCosts.mockResolvedValue({ status: "ok", totalCostMicroUsd: 12 });
  reconcilePendingGenerationBillings.mockResolvedValue({ attempted: 2, settled: 2, failed: 0 });
});

describe("admin generation billing route", () => {
  it("returns the requested period", async () => {
    getGenerationBillingAdminData.mockResolvedValue({ days: 90, generations: [] });
    const response = await GET(
      new NextRequest("http://localhost/api/admin/generation-billing?days=90"),
    );
    expect(response.status).toBe(200);
    expect(getGenerationBillingAdminData).toHaveBeenCalledWith(90, 200, expect.any(Date));
    expect(fetchOpenAiOrganizationCosts).toHaveBeenCalledWith({
      days: 90,
      now: expect.any(Date),
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      openAiReconciliation: { status: "ok", totalCostMicroUsd: 12 },
    });
  });

  it("persists validated settings with the admin actor", async () => {
    updateGenerationBillingSettings.mockResolvedValue({ markupMultiplier: 2.8 });
    const response = await PATCH(
      new NextRequest("http://localhost/api/admin/generation-billing", {
        method: "PATCH",
        body: JSON.stringify({ markupMultiplier: 2.8, usdToSek: 10.5, sekPerCredit: 3 }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);
    expect(updateGenerationBillingSettings).toHaveBeenCalledWith({
      markupMultiplier: 2.8,
      usdToSek: 10.5,
      sekPerCredit: 3,
      updatedBy: "admin_1",
    });
  });

  it("rejects invalid numeric input", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost/api/admin/generation-billing", {
        method: "PATCH",
        body: JSON.stringify({ markupMultiplier: "nej", usdToSek: 10.5, sekPerCredit: 3 }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(400);
    expect(updateGenerationBillingSettings).not.toHaveBeenCalled();
  });

  it("runs explicit idempotent reconciliation", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/admin/generation-billing", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    expect(reconcilePendingGenerationBillings).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      reconciliation: { attempted: 2, settled: 2, failed: 0 },
    });
  });
});
