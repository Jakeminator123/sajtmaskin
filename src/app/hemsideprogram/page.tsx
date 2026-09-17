import type { Metadata } from "next";
import { createSeoLandingMetadata } from "@/lib/seo-landing-pages/metadata";
import { HemsideprogramContent } from "./hemsideprogram-content";

/**
 * Category SEO landing: compare website-tool types, not a ranked brand list.
 *
 * Keep server metadata via `createSeoLandingMetadata`. Flip the registry
 * `status` to `ready` only after this file renders real page content.
 */
export const metadata: Metadata = createSeoLandingMetadata("hemsideprogram");

export default function HemsideprogramPage() {
  return <HemsideprogramContent />;
}
