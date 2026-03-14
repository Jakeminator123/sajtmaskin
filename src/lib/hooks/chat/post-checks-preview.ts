import type { PreviewPreflightState } from "@/lib/gen/preview-diagnostics";
import type { VersionErrorLogPayload } from "./types";

export type PreviewUnavailableDetails = {
  message: string;
  previewCode: "preflight_preview_blocked" | "preview_missing_url";
  previewStage: "preflight" | "iframe";
  previewSource: "finalize-preflight" | "post-check";
  previewBlocked: boolean;
  verificationBlocked: boolean;
  previewBlockingReason: string | null;
};

export function readPreviewPreflight(data: unknown): PreviewPreflightState | null {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const nested =
    root?.preflight && typeof root.preflight === "object"
      ? (root.preflight as Record<string, unknown>)
      : null;
  const previewBlocked =
    typeof nested?.previewBlocked === "boolean"
      ? nested.previewBlocked
      : typeof root?.previewBlocked === "boolean"
        ? root.previewBlocked
        : null;
  const verificationBlocked =
    typeof nested?.verificationBlocked === "boolean"
      ? nested.verificationBlocked
      : typeof root?.verificationBlocked === "boolean"
        ? root.verificationBlocked
        : null;
  const previewBlockingReason =
    typeof nested?.previewBlockingReason === "string"
      ? nested.previewBlockingReason
      : typeof root?.previewBlockingReason === "string"
        ? root.previewBlockingReason
        : null;

  if (previewBlocked === null && verificationBlocked === null && !previewBlockingReason) {
    return null;
  }

  return {
    previewBlocked: previewBlocked ?? false,
    verificationBlocked: verificationBlocked ?? false,
    previewBlockingReason,
  };
}

export function getPreviewBlockingReason(
  preflight?: PreviewPreflightState | null,
): string | null {
  return preflight?.previewBlocked && preflight.previewBlockingReason
    ? preflight.previewBlockingReason
    : null;
}

export function buildPreviewUnavailableDetails(
  preflight?: PreviewPreflightState | null,
): PreviewUnavailableDetails {
  const previewBlockingReason = getPreviewBlockingReason(preflight);
  if (previewBlockingReason) {
    return {
      message: `Preview blockerades i preflight: ${previewBlockingReason}`,
      previewCode: "preflight_preview_blocked",
      previewStage: "preflight",
      previewSource: "finalize-preflight",
      previewBlocked: true,
      verificationBlocked: preflight?.verificationBlocked ?? false,
      previewBlockingReason,
    };
  }

  return {
    message: "Preview-länk saknas för versionen.",
    previewCode: "preview_missing_url",
    previewStage: "iframe",
    previewSource: "post-check",
    previewBlocked: preflight?.previewBlocked ?? false,
    verificationBlocked: preflight?.verificationBlocked ?? false,
    previewBlockingReason: null,
  };
}

export function buildPreviewUnavailableLog(
  versionId: string,
  preflight?: PreviewPreflightState | null,
): VersionErrorLogPayload {
  const details = buildPreviewUnavailableDetails(preflight);
  return {
    level: "error",
    category: "preview",
    message: details.message,
    meta: {
      versionId,
      previewCode: details.previewCode,
      previewStage: details.previewStage,
      previewSource: details.previewSource,
      previewBlocked: details.previewBlocked,
      verificationBlocked: details.verificationBlocked,
      previewBlockingReason: details.previewBlockingReason,
    },
  };
}

export function buildPreviewUnavailableStep(
  preflight?: PreviewPreflightState | null,
): string {
  return buildPreviewUnavailableDetails(preflight).message;
}

export function getPreviewUnavailableQualityGateFailure(
  preflight?: PreviewPreflightState | null,
): "preflight_preview_blocked" | "missing_preview_url" {
  return preflight?.previewBlocked ? "preflight_preview_blocked" : "missing_preview_url";
}

export function getPreviewUnavailableAutoFixReason(
  preflight?: PreviewPreflightState | null,
): string {
  return getPreviewBlockingReason(preflight)
    ? "preview blockerad i preflight"
    : "preview saknas";
}
