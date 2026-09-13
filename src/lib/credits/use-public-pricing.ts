"use client";

import { useEffect, useState } from "react";
import {
  FALLBACK_PUBLIC_PRICING,
  parsePublicPricing,
  publicPricingToBreakdown,
  type PublicPricing,
} from "./public-pricing";
import type { CreditCostBreakdown } from "./pricing";

/**
 * Hämtar den effektiva prislistan. Startar på kodkonstanterna så första
 * render inte blinkar tom, och stannar där om anropet fallerar.
 */
export function usePublicPricing(): {
  pricing: PublicPricing;
  breakdown: CreditCostBreakdown;
} {
  const [pricing, setPricing] = useState<PublicPricing>(FALLBACK_PUBLIC_PRICING);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/pricing", {
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const json: unknown = await response.json();
        const parsed = parsePublicPricing(json);
        if (parsed) setPricing(parsed);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    })();
    return () => controller.abort();
  }, []);

  return { pricing, breakdown: publicPricingToBreakdown(pricing) };
}
