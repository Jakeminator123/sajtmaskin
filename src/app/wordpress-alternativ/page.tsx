import type { Metadata } from "next";
import { SeoLandingPlaceholder } from "@/components/seo-landing-pages/seo-landing-placeholder";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";

export const metadata: Metadata = createSeoLandingMetadata("wordpress-alternativ");

export default function WordpressAlternativPage() {
  return <SeoLandingPlaceholder slug="wordpress-alternativ" />;
}
