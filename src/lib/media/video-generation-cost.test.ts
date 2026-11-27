// @vitest-environment node
import { expect, it, vi } from "vitest";

const { getGenerationBillingSettings } = vi.hoisted(() => ({ getGenerationBillingSettings: vi.fn() }));
vi.mock("@/lib/db/services/generation-billing", () => ({ getGenerationBillingSettings }));

import { getVideoGenerationPrice, VIDEO_PROVIDER_COST_MICRO_USD } from "./video-generation-cost";

it("quotes five seconds at 25 Runway credits with the account's current billing settings", async () => {
  getGenerationBillingSettings.mockResolvedValue({ markupBasisPoints: 30_000, usdToSekOre: 1_200, sekPerCreditOre: 300 });
  expect(VIDEO_PROVIDER_COST_MICRO_USD).toBe(250_000);
  expect(await getVideoGenerationPrice()).toEqual({
    providerCostOre: 300,
    billableOre: 900,
    credits: 3,
    quote: { credits: 3, durationSeconds: 5, model: "gen4_turbo" },
  });
});
