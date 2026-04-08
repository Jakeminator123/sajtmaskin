import {
  isCompatibilityShimPreviewUrl,
  isTier2LivePreviewUrl,
  normalizePreviewUrl,
} from "@/lib/gen/preview/legacy/compatibility-shim";

/** Discrete preview lifecycle for own-engine live preview + iframe (builder UI). */
export type PreviewLifecycleState =
  | "idle"
  | "bootstrapping"
  | "live"
  | "recovering"
  | "failed";

export type DerivePreviewLifecycleInput = {
  previewBuildErrorStage?: string | null;
  hasPreviewBuildError: boolean;
  previewSessionRecovering: boolean;
  previewPending: boolean;
  currentPreviewUrl: string | null;
};

/**
 * Canonical UI lifecycle mapping from preview VM/session state.
 */
export function derivePreviewLifecycleState(
  input: DerivePreviewLifecycleInput,
): PreviewLifecycleState {
  if (input.previewBuildErrorStage === "preview_session_disabled") return "failed";
  if (input.previewSessionRecovering) return "recovering";
  if (input.previewPending) return "bootstrapping";
  if (input.hasPreviewBuildError) return "failed";
  const url = normalizePreviewUrl(input.currentPreviewUrl);
  if (url && isTier2LivePreviewUrl(url)) return "live";
  if (url && !isCompatibilityShimPreviewUrl(url)) return "live";
  return "idle";
}
