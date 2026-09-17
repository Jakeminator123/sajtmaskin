import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { HemsidaTillForetagContent } from "./hemsida-till-foretag-content";

/**
 * B2B SEO landing: company-site outcomes, not tool category.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("hemsida-till-foretag");

export default function HemsidaTillForetagPage() {
  return <HemsidaTillForetagContent />;
}
