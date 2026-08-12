/**
 * Contract between `POST /api/figma/preview` and the builder's Figma input.
 *
 * `FIGMA_ACCESS_TOKEN` is `optional_runtime` in `config/env-policy.json`, so an
 * unset token is an expected deployment state rather than a failure. The route
 * reports that state with `FIGMA_PREVIEW_NOT_CONFIGURED` so the client can tell
 * it apart from a real Figma failure without matching on prose — the user gets
 * a neutral notice instead of an error they cannot act on.
 */
export const FIGMA_PREVIEW_NOT_CONFIGURED = "figma_preview_not_configured";

export type FigmaPreviewResponse = {
  success?: boolean;
  /** Present on failures that the client is expected to branch on. */
  code?: string;
  error?: string;
  imageUrl?: string;
  nodeId?: string;
  fileKey?: string;
  fileName?: string;
  cached?: boolean;
};
