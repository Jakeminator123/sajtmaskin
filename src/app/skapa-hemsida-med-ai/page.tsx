import type { Metadata } from "next";
import { SeoLandingPlaceholder } from "@/components/seo-landing-pages/seo-landing-placeholder";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";

/**
 * Reference SEO landing route.
 *
 * Future finished pages follow the same shape:
 * - server `page.tsx` with unique `metadata`
 * - ordinary App Router URL on the main domain
 * - product CTA via the registry (`/builder?new=1`)
 * - replace `SeoLandingPlaceholder` with extracted design/content
 * - flip `status` to `"ready"` in the registry before sitemap/index
 *
 * Do not embed a second app, iframe, or subdomain here.
 */
export const metadata: Metadata = createSeoLandingMetadata("skapa-hemsida-med-ai");

export default function SkapaHemsidaMedAiPage() {
  return <SeoLandingPlaceholder slug="skapa-hemsida-med-ai" />;
}
