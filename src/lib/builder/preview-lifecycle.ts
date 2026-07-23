import { isCompatibilityShimPreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import {
  isTier2LivePreviewUrl,
  normalizePreviewUrl,
} from "@/lib/gen/preview/preview-url-classifier";

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

export type PreviewLoadingOverlayInput = {
  isCreatingChat: boolean;
  previewPending: boolean;
  previewLifecycle: PreviewLifecycleState;
  currentPreviewUrl: string | null;
  isAnyStreaming: boolean;
};

/**
 * Non-blocking verify/pending UX (2026-07 preview-lifecycle simplification):
 * decide whether the full click-blocking loading overlay may cover the
 * preview iframe. `previewPending` (verification / preview-session bootstrap
 * running in the background) only blocks while there is NO live tier-2
 * preview on screen — once a working preview renders, the thin status strip
 * in the preview chrome communicates pending work and the user keeps
 * interacting with the last-good preview.
 */
export function shouldBlockPreviewWithLoadingOverlay(
  input: PreviewLoadingOverlayInput,
): boolean {
  const hasLivePreviewOnScreen = isTier2LivePreviewUrl(input.currentPreviewUrl);
  return (
    input.isCreatingChat ||
    (input.previewPending && !hasLivePreviewOnScreen) ||
    input.previewLifecycle === "recovering" ||
    (!input.currentPreviewUrl && input.isAnyStreaming)
  );
}
