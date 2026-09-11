import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CREDIT_ACTION_PRICES } from "./pricing";
import { FALLBACK_PUBLIC_PRICING } from "./public-pricing";
import { usePublicPricing } from "./use-public-pricing";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePublicPricing", () => {
  it("starts on the code-constant fallback and then applies a live list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          domain: { markup: 7, usdToSek: 9.5 },
          credits: {
            ...DEFAULT_CREDIT_ACTION_PRICES,
            deployProduction: 25,
            openclawTip: 4,
          },
        }),
      }),
    );

    const { result } = renderHook(() => usePublicPricing());
    expect(result.current.pricing).toEqual(FALLBACK_PUBLIC_PRICING);
    expect(result.current.breakdown.deploy).toBe(DEFAULT_CREDIT_ACTION_PRICES.deployProduction);

    await waitFor(() => {
      expect(result.current.pricing.credits.deployProduction).toBe(25);
    });
    expect(result.current.breakdown.deploy).toBe(25);
    expect(result.current.pricing.credits.openclawTip).toBe(4);
  });

  it("keeps the fallback when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { result } = renderHook(() => usePublicPricing());
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalled();
    });
    expect(result.current.pricing).toEqual(FALLBACK_PUBLIC_PRICING);
  });
});
