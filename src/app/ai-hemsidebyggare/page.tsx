import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { AiHemsidebyggareContent } from "./ai-hemsidebyggare-content";

/**
 * Category SEO landing: how to compare AI website builders.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("ai-hemsidebyggare");

export default function AiHemsidebyggarePage() {
  return <AiHemsidebyggareContent />;
}
