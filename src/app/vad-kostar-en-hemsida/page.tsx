import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { VadKostarEnHemsidaContent } from "./vad-kostar-en-hemsida-content";

/**
 * Cost SEO landing: cost drivers and scopes, never invented SEK tags.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("vad-kostar-en-hemsida");

export default function VadKostarEnHemsidaPage() {
  return <VadKostarEnHemsidaContent />;
}
