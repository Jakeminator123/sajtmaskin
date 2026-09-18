import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { WixAlternativContent } from "./wix-alternativ-content";

/**
 * Wix comparison SEO landing: workflow tradeoffs, disclosed Sajtmaskin authorship.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("wix-alternativ");

export default function WixAlternativPage() {
  return <WixAlternativContent />;
}
