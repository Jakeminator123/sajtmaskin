import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { SkapaHemsidaMedAiContent } from "./skapa-hemsida-med-ai-content";

/**
 * Reference SEO landing route on the main domain.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("skapa-hemsida-med-ai");

export default function SkapaHemsidaMedAiPage() {
  return <SkapaHemsidaMedAiContent />;
}
