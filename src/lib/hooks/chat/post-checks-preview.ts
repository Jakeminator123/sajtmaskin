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
  const scaffoldRetryRoot =
    root?.scaffoldRetry && typeof root.scaffoldRetry === "object"
      ? (root.scaffoldRetry as Record<string, unknown>)
      : null;
  const scaffoldRetryNested =
    nested?.scaffoldRetry && typeof nested.scaffoldRetry === "object"
      ? (nested.scaffoldRetry as Record<string, unknown>)
      : null;
  const scaffoldRetryData = scaffoldRetryNested ?? scaffoldRetryRoot;
  const scaffoldRetry =
    scaffoldRetryData &&
    typeof scaffoldRetryData.currentScaffoldId === "string" &&
    typeof scaffoldRetryData.currentScaffoldLabel === "string" &&
    typeof scaffoldRetryData.suggestedScaffoldId === "string" &&
    typeof scaffoldRetryData.suggestedScaffoldLabel === "string" &&
    typeof scaffoldRetryData.suggestedScaffoldFamily === "string" &&
    typeof scaffoldRetryData.failureType === "string" &&
    typeof scaffoldRetryData.reason === "string" &&
    (scaffoldRetryData.source === "heuristic" ||
      scaffoldRetryData.source === "embedding") &&
    (scaffoldRetryData.confidence === "medium" || scaffoldRetryData.confidence === "high")
      ? {
          currentScaffoldId: scaffoldRetryData.currentScaffoldId,
          currentScaffoldLabel: scaffoldRetryData.currentScaffoldLabel,
          suggestedScaffoldId: scaffoldRetryData.suggestedScaffoldId,
          suggestedScaffoldLabel: scaffoldRetryData.suggestedScaffoldLabel,
          suggestedScaffoldFamily: scaffoldRetryData.suggestedScaffoldFamily,
          failureType: scaffoldRetryData.failureType,
          reason: scaffoldRetryData.reason,
          source: scaffoldRetryData.source as "heuristic" | "embedding",
          confidence: scaffoldRetryData.confidence as "medium" | "high",
        }
      : null;
  const routePlanRoot =
    root?.routePlan && typeof root.routePlan === "object"
      ? (root.routePlan as Record<string, unknown>)
      : null;
  const routePlanNested =
    nested?.routePlan && typeof nested.routePlan === "object"
      ? (nested.routePlan as Record<string, unknown>)
      : null;
  const routePlanData = routePlanNested ?? routePlanRoot;
  const routePlan =
    routePlanData &&
    (routePlanData.source === "brief" ||
      routePlanData.source === "prompt" ||
      routePlanData.source === "scaffold") &&
    (routePlanData.siteType === "one-page" ||
      routePlanData.siteType === "brochure" ||
      routePlanData.siteType === "content-heavy" ||
      routePlanData.siteType === "app-shell") &&
    typeof routePlanData.reason === "string" &&
    Array.isArray(routePlanData.routes)
      ? {
          source: routePlanData.source as "brief" | "prompt" | "scaffold",
          siteType: routePlanData.siteType as "one-page" | "brochure" | "content-heavy" | "app-shell",
          reason: routePlanData.reason,
          routes: routePlanData.routes
            .filter(
              (route): route is Record<string, unknown> =>
                Boolean(route) &&
                typeof route === "object" &&
                typeof route.path === "string" &&
                typeof route.name === "string" &&
                typeof route.intent === "string",
            )
            .map((route) => ({
              path: route.path as string,
              name: route.name as string,
              intent: route.intent as string,
              required: typeof route.required === "boolean" ? route.required : false,
            })),
        }
      : null;

  if (previewBlocked === null && verificationBlocked === null && !previewBlockingReason && !scaffoldRetry && !routePlan) {
    return null;
  }

  return {
    previewBlocked: previewBlocked ?? false,
    verificationBlocked: verificationBlocked ?? false,
    previewBlockingReason,
    scaffoldRetry,
    routePlan,
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
