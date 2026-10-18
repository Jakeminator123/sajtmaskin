import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { HemsidaFastighetsskotselContent } from "./hemsida-fastighetsskotsel-content";

/**
 * Industry SEO landing: unique Swedish copy for this vertical.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("hemsida-fastighetsskotsel");

export default function HemsidaFastighetsskotselPage() {
  return <HemsidaFastighetsskotselContent />;
}
