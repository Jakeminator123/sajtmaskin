import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { SeoLandingJsonLd } from "@/lib/seo-landing-pages/structured-data";
import { FAQS, LovableAlternativContent } from "./lovable-alternativ-content";

/**
 * Lovable comparison SEO landing: build-goal framing, product moves fast.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("lovable-alternativ");

export default function LovableAlternativPage() {
  return (
    <>
      <SeoLandingJsonLd slug="lovable-alternativ" faqs={FAQS} />
      <LovableAlternativContent />
    </>
  );
}
