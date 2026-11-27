import { calculateCustomerCharge } from "@/lib/billing/model-cost";
import { getGenerationBillingSettings } from "@/lib/db/services/generation-billing";
import {
  VIDEO_GENERATION_DURATION_SECONDS,
  VIDEO_GENERATION_MODEL,
  type VideoGenerationQuote,
} from "./video-generation-contract";

// 5 Runway credits per second at $0.01 each.
export const VIDEO_PROVIDER_COST_MICRO_USD = VIDEO_GENERATION_DURATION_SECONDS * 5 * 10_000;

export async function getVideoGenerationPrice() {
  const settings = await getGenerationBillingSettings();
  const charge = calculateCustomerCharge({
    providerCostMicroUsd: VIDEO_PROVIDER_COST_MICRO_USD,
    ...settings,
  });
  const quote: VideoGenerationQuote = {
    credits: charge.credits,
    durationSeconds: VIDEO_GENERATION_DURATION_SECONDS,
    model: VIDEO_GENERATION_MODEL,
  };
  return { ...charge, quote };
}
