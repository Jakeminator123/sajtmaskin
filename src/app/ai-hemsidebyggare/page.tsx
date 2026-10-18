import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { SeoLandingJsonLd } from "@/lib/seo-landing-pages/structured-data";
import { AiHemsidebyggareContent, FAQS } from "./ai-hemsidebyggare-content";

/**
 * Category SEO landing: how to compare AI website builders.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("ai-hemsidebyggare");

export default function AiHemsidebyggarePage() {
  return (
    <>
      <SeoLandingJsonLd slug="ai-hemsidebyggare" faqs={FAQS} />
      <AiHemsidebyggareContent />
    </>
  );
}
