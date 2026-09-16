import type { Metadata } from "next";
import { SeoLandingPlaceholder } from "@/components/seo-landing-pages/seo-landing-placeholder";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";

export const metadata: Metadata = createSeoLandingMetadata("hemsida-utan-kod");

export default function HemsidaUtanKodPage() {
  return <SeoLandingPlaceholder slug="hemsida-utan-kod" />;
}
