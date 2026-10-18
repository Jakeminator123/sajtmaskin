import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { SeoLandingJsonLd } from "@/lib/seo-landing-pages/structured-data";
import { FAQS, HemsidaUtanKodContent } from "./hemsida-utan-kod-content";

/**
 * No-code SEO landing: what you can do without programming, and what you cannot skip.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("hemsida-utan-kod");

export default function HemsidaUtanKodPage() {
  return (
    <>
      <SeoLandingJsonLd slug="hemsida-utan-kod" faqs={FAQS} />
      <HemsidaUtanKodContent />
    </>
  );
}
