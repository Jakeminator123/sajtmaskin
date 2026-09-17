import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { SkapaHemsidaContent } from "./skapa-hemsida-content";

/**
 * Technique-neutral SEO landing route on the main domain.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("skapa-hemsida");

export default function SkapaHemsidaPage() {
  return <SkapaHemsidaContent />;
}
