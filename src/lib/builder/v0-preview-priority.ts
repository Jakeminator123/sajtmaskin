import { isAffirmativeEnvValue } from "@/lib/env-affirmative";

/**
 * Client-side mirror of `V0_FALLBACK_BUILDER` (inlined at build via `next.config`).
 * When on, builder preview resolution may prefer v0-hosted `demoUrl` over sandbox.
 */
export function isV0BuilderPreviewFallbackEnabledInBrowser(): boolean {
  if (typeof process === "undefined") return false;
  return isAffirmativeEnvValue(process.env.NEXT_PUBLIC_V0_BUILDER_PREVIEW_FALLBACK);
}
