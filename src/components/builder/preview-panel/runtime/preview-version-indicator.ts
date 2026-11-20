import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";

export type PreviewVersionIndicator = {
  text: string;
  /** live = on screen, pending = saved and starting, attention = not on screen. */
  tone: "live" | "pending" | "attention";
};

/**
 * What the preview panel says about the version it shows (2026-11-11, chat
 * ff62820f): the chat said "Klart" while the iframe still showed the host's
 * start page or the previous version, and nothing on screen said which. The
 * preview now says it itself. "Visar version N" requires the iframe's ready
 * receipt, which `usePreviewIframe` only accepts for this exact version, or
 * the site's own route report for this exact session and version; any other
 * doubt (loading, ready-timeout, pending) says "startar" instead.
 */
export function describePreviewVersionIndicator(input: {
  hasVersion: boolean;
  versionNumber?: number | null;
  previewLifecycle?: PreviewLifecycleState;
  previewPending?: boolean;
  iframeLoading?: boolean;
  iframeError?: boolean;
  /**
   * The site itself reported that it is rendered in the frame: preview-host's
   * document bootstrap (injected only into pages served by the runtime, never
   * into the host's start page) posted a route for exactly this session and
   * version (`usePreviewRouteBridge`). That is on screen even while the
   * readiness receipt chain is still verifying (rig 2026-11-11: the site was
   * visible 10,6 s before the receipt chain settled).
   */
  siteDocumentObserved?: boolean;
  /**
   * The iframe's ready receipt timed out (`preview_ready_timeout`). Loading and
   * error are both false then (the timeout is silent in the UI), while the
   * frame may still show the host's start page — so this is "starting".
   */
  readyTimedOut?: boolean;
  /** A real failure (not an `info` notice about an unverifiable page). */
  hasBuildError?: boolean;
  hasVersionMismatch?: boolean;
}): PreviewVersionIndicator | null {
  if (!input.hasVersion) return null;
  const n = input.versionNumber;
  // Nothing rather than a text without a number (rig 2026-11-11: "Vald
  // version är sparad" showed for 1,3 s before the version list arrived).
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) return null;
  const label = `version ${n}`;
  const saved = `${label.charAt(0).toUpperCase()}${label.slice(1)} är sparad`;
  if (input.hasVersionMismatch) {
    return { text: `${saved}, förhandsvisningen visar en annan version`, tone: "attention" };
  }
  if (input.hasBuildError || input.iframeError || input.previewLifecycle === "failed") {
    return { text: `${saved}, förhandsvisningen startade inte`, tone: "attention" };
  }
  if (input.siteDocumentObserved) {
    return { text: `Visar ${label}`, tone: "live" };
  }
  if (
    input.previewPending ||
    input.iframeLoading ||
    input.readyTimedOut ||
    input.previewLifecycle === "bootstrapping" ||
    input.previewLifecycle === "recovering"
  ) {
    return { text: `${saved}, förhandsvisningen startar`, tone: "pending" };
  }
  return { text: `Visar ${label}`, tone: "live" };
}
