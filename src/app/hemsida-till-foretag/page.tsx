import type { Metadata } from "next";
import { SeoLandingPlaceholder } from "@/components/seo-landing-pages/seo-landing-placeholder";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";

export const metadata: Metadata = createSeoLandingMetadata("hemsida-till-foretag");

export default function HemsidaTillForetagPage() {
  return <SeoLandingPlaceholder slug="hemsida-till-foretag" />;
}
