import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { OneComAlternativContent } from "./one-com-alternativ-content";

/**
 * Comparison SEO landing: workflow tradeoffs, disclosed Sajtmaskin authorship.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("one-com-alternativ");

export default function OneComAlternativPage() {
  return <OneComAlternativContent />;
}
