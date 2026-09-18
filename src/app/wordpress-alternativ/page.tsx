import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { WordpressAlternativContent } from "./wordpress-alternativ-content";

/**
 * WordPress comparison SEO landing: ecosystem vs ops, no security scare-copy.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("wordpress-alternativ");

export default function WordpressAlternativPage() {
  return <WordpressAlternativContent />;
}
