import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { SquarespaceAlternativContent } from "./squarespace-alternativ-content";

/**
 * Comparison SEO landing: workflow tradeoffs, disclosed Sajtmaskin authorship.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("squarespace-alternativ");

export default function SquarespaceAlternativPage() {
  return <SquarespaceAlternativContent />;
}
