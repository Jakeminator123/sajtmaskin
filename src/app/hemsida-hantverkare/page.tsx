import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { HemsidaHantverkareContent } from "./hemsida-hantverkare-content";

/**
 * Industry SEO landing: unique Swedish copy for this vertical.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("hemsida-hantverkare");

export default function HemsidaHantverkarePage() {
  return <HemsidaHantverkareContent />;
}
