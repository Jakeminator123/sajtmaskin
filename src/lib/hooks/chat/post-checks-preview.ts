import type { PreviewPreflightState } from "@/lib/gen/preview/diagnostics";
import { parseRoutePlanFromUnknown } from "@/lib/gen/route-plan";
import type { PreflightIssueCategory, PreviewPrimaryTarget } from "@/lib/gen/stream/preflight-contract";
import type { VersionErrorLogPayload } from "./types";

function isPreviewPrimaryTarget(value: unknown): value is PreviewPrimaryTarget {
  return value === "preview" || value === "none";
}

function isPreflightIssueCategory(value: unknown): value is PreflightIssueCategory {
  return (
    value === "code_structure_failure" ||
    value === "dependency_install_failure" ||
    value === "env_config_missing" ||
    value === "shim_preview_failure" ||
    value === "non_blocking_quality_warning"
  );
}

export type PreviewUnavailableDetails = {
  message: string;
  previewCode:
    | "preflight_preview_blocked"
    | "preview_missing_url"
    | "preview_waiting_for_vm";
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
  const primaryPreviewTarget =
    isPreviewPrimaryTarget(nested?.primaryPreviewTarget)
      ? nested.primaryPreviewTarget
      : isPreviewPrimaryTarget(root?.primaryPreviewTarget)
        ? root.primaryPreviewTarget
        : undefined;
  const issueCategories =
    Array.isArray(nested?.issueCategories)
      ? nested.issueCategories.filter(isPreflightIssueCategory)
      : Array.isArray(root?.issueCategories)
        ? root.issueCategories.filter(isPreflightIssueCategory)
        : undefined;
  const previewStartRoot =
    root?.previewStart && typeof root.previewStart === "object"
      ? (root.previewStart as Record<string, unknown>)
      : null;
  const previewStartNested =
    nested?.previewStart && typeof nested.previewStart === "object"
      ? (nested.previewStart as Record<string, unknown>)
      : null;
  const previewStartData = previewStartNested ?? previewStartRoot;
  const previewStart =
    previewStartData &&
    typeof previewStartData.canStartPreview === "boolean" &&
    isPreviewPrimaryTarget(previewStartData.primaryPreviewTarget) &&
    typeof previewStartData.shimBlocked === "boolean" &&
    typeof previewStartData.requiresEnvConfig === "boolean" &&
    typeof previewStartData.hasCriticalInstallRisk === "boolean" &&
    typeof previewStartData.hasCriticalCodeFailure === "boolean" &&
    typeof previewStartData.compatibilityPreviewAllowed === "boolean" &&
    previewStartData.issueCounts &&
    typeof previewStartData.issueCounts === "object" &&
    Array.isArray(previewStartData.blockingCategories)
      ? {
          canStartPreview: previewStartData.canStartPreview,
          primaryPreviewTarget: previewStartData.primaryPreviewTarget,
          shimBlocked: previewStartData.shimBlocked,
          requiresEnvConfig: previewStartData.requiresEnvConfig,
          hasCriticalInstallRisk: previewStartData.hasCriticalInstallRisk,
          hasCriticalCodeFailure: previewStartData.hasCriticalCodeFailure,
          compatibilityPreviewAllowed: previewStartData.compatibilityPreviewAllowed,
          issueCounts: {
            code_structure_failure:
              Number((previewStartData.issueCounts as Record<string, unknown>).code_structure_failure) || 0,
            dependency_install_failure:
              Number((previewStartData.issueCounts as Record<string, unknown>).dependency_install_failure) || 0,
            env_config_missing:
              Number((previewStartData.issueCounts as Record<string, unknown>).env_config_missing) || 0,
            shim_preview_failure:
              Number((previewStartData.issueCounts as Record<string, unknown>).shim_preview_failure) || 0,
            non_blocking_quality_warning:
              Number((previewStartData.issueCounts as Record<string, unknown>).non_blocking_quality_warning) || 0,
          },
          blockingCategories: previewStartData.blockingCategories.filter(
            isPreflightIssueCategory,
          ),
        }
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
      scaffoldRetryData.source === "keyword" ||
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
          source: scaffoldRetryData.source as "heuristic" | "keyword" | "embedding",
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
    routePlanData && typeof routePlanData === "object" && !Array.isArray(routePlanData)
      ? parseRoutePlanFromUnknown(routePlanData as Record<string, unknown>)
      : null;

  if (
    previewBlocked === null &&
    verificationBlocked === null &&
    !previewBlockingReason &&
    !primaryPreviewTarget &&
    !issueCategories &&
    !previewStart &&
    !scaffoldRetry &&
    !routePlan
  ) {
    return null;
  }

  return {
    previewBlocked: previewBlocked ?? false,
    verificationBlocked: verificationBlocked ?? false,
    previewBlockingReason,
    primaryPreviewTarget,
    issueCategories,
    previewStart,
    scaffoldRetry,
    routePlan,
  };
}

export function isPreviewPendingInVm(
  preflight?: PreviewPreflightState | null,
): boolean {
  return Boolean(
    preflight?.previewStart?.canStartPreview &&
      preflight.previewStart.primaryPreviewTarget === "preview",
  );
}

export function getPreviewBlockingReason(
  preflight?: PreviewPreflightState | null,
): string | null {
  return preflight?.previewBlocked && preflight.previewBlockingReason
    ? preflight.previewBlockingReason
    : null;
}

function buildPreviewUnavailableDetails(
  preflight?: PreviewPreflightState | null,
): PreviewUnavailableDetails {
  if (isPreviewPendingInVm(preflight)) {
    return {
      message: "Live-preview startar i VM och blir tillgänglig när miljön är redo.",
      previewCode: "preview_waiting_for_vm",
      previewStage: "preflight",
      previewSource: "finalize-preflight",
      previewBlocked: false,
      verificationBlocked: false,
      previewBlockingReason: null,
    };
  }

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
): "preflight_preview_blocked" | "missing_preview_url" | "preview_waiting_for_vm" {
  if (isPreviewPendingInVm(preflight)) return "preview_waiting_for_vm";
  return preflight?.previewBlocked ? "preflight_preview_blocked" : "missing_preview_url";
}

export function getPreviewUnavailableAutoFixReason(
  preflight?: PreviewPreflightState | null,
): string {
  if (isPreviewPendingInVm(preflight)) {
    return "live-preview väntar på VM";
  }
  return getPreviewBlockingReason(preflight)
    ? "preview blockerad i preflight"
    : "preview saknas";
}
