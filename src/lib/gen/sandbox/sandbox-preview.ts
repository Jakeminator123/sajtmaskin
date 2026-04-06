/**
 * Legacy compat path.
 * Canonical implementation now lives in `@/lib/gen/preview/preview-session`.
 */
export type {
  PreviewSessionTier2Meta,
  PreviewSessionResult,
  PreviewSessionFailureCode,
  PreviewSessionError,
  StartPreviewSessionOptions,
} from "@/lib/gen/preview/preview-session";

export {
  startPreviewSession,
  startSandboxPreview,
} from "@/lib/gen/preview/preview-session";
