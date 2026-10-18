import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { HemsidaPersonligTranareContent } from "./hemsida-personlig-tranare-content";

/**
 * Industry SEO landing: unique Swedish copy for this vertical.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("hemsida-personlig-tranare");

export default function HemsidaPersonligTranarePage() {
  return <HemsidaPersonligTranareContent />;
}
