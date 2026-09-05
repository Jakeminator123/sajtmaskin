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

/**
 * Last preview/build failure surfaced in the builder for the active session.
 *
 * `severity` decides how the UI treats it: `error` (default) is a real
 * failure — the preview did not come up and the lifecycle turns `failed`;
 * `info` is a notice about something the pipeline could not verify (e.g. a
 * client-rendered page the JS-less readiness probe cannot see) — the preview
 * keeps rendering and the lifecycle stays `live`. `detail` is optional raw
 * diagnostic text (host log tail) for a collapsed details panel; `message`
 * is always plain language for the end user.
 */
export type PreviewBuildErrorState = {
  stage: string;
  message: string;
  severity?: "error" | "info";
  /** Plain-language heading; the UI falls back to a stage-based title when absent. */
  title?: string;
  detail?: string | null;
};

/** Banner heading for a preview failure; never exposes the raw `stage` id. */
export function previewBuildErrorTitle(error: PreviewBuildErrorState): string {
  if (error.title?.trim()) return error.title.trim();
  switch (error.stage) {
    case "sandbox_disabled":
    case "preview_session_disabled":
      return "Live-förhandsvisning inte tillgänglig";
    case "preview-unverified":
      return "Förhandsvisningen kunde inte kontrolleras automatiskt";
    case "preview-recover":
      return "Förhandsvisningen tappade kontakten";
    case "preview-build-error":
      return "Förhandsvisningen stoppade på ett fel";
    default:
      return "Förhandsvisningen kunde inte starta";
  }
}

export function isPreviewBuildErrorBlocking(
  error: PreviewBuildErrorState | null | undefined,
): boolean {
  return Boolean(error) && error?.severity !== "info";
}

export type DerivePreviewLifecycleInput = {
  previewBuildErrorStage?: string | null;
  hasPreviewBuildError: boolean;
  previewSessionRecovering: boolean;
  previewPending: boolean;
  currentPreviewUrl: string | null;
};

/**
 * Canonical UI lifecycle mapping from preview VM/session state.
 * `hasPreviewBuildError` must already exclude `info`-severity notices (see
 * {@link isPreviewBuildErrorBlocking}) — they never make the preview `failed`.
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
