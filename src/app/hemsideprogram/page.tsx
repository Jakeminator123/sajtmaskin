import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { SeoLandingJsonLd } from "@/lib/seo-landing-pages/structured-data";
import { FAQS, HemsideprogramContent } from "./hemsideprogram-content";

/**
 * Category SEO landing: compare website-tool types, not a ranked brand list.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("hemsideprogram");

export default function HemsideprogramPage() {
  return (
    <>
      <SeoLandingJsonLd slug="hemsideprogram" faqs={FAQS} />
      <HemsideprogramContent />
    </>
  );
}
