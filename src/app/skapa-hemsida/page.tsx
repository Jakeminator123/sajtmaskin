import type { Metadata } from "next";
import { SeoLandingPlaceholder } from "@/components/seo-landing-pages/seo-landing-placeholder";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";

export const metadata: Metadata = createSeoLandingMetadata("skapa-hemsida");

export default function SkapaHemsidaPage() {
  return <SeoLandingPlaceholder slug="skapa-hemsida" />;
}
