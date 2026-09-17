import type { Metadata } from "next";
import { SeoLandingPlaceholder } from "@/components/seo-landing-pages/seo-landing-placeholder";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";

export const metadata: Metadata = createSeoLandingMetadata("wix-alternativ");

export default function WixAlternativPage() {
  return <SeoLandingPlaceholder slug="wix-alternativ" />;
}
