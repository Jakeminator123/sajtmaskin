import type { Metadata } from "next";
import { SeoLandingPlaceholder } from "@/components/seo-landing-pages/seo-landing-placeholder";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";

export const metadata: Metadata = createSeoLandingMetadata("vad-kostar-en-hemsida");

export default function VadKostarEnHemsidaPage() {
  return <SeoLandingPlaceholder slug="vad-kostar-en-hemsida" />;
}
