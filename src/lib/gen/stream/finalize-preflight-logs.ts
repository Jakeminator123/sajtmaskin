import type { ScaffoldRetrySuggestion } from "@/lib/gen/scaffolds/scaffold-aware-retry";
import type { RoutePlan } from "@/lib/gen/route-plan";
import type { FinalizePreflightIssue } from "./finalize-preflight";

export interface FinalizeVersionErrorLog {
  chatId: string;
  versionId: string;
  level: "info" | "warning" | "error";
  category: string;
  message: string;
  meta: Record<string, unknown>;
}

export interface BuildFinalizePreflightLogBundleParams {
  chatId: string;
  versionId: string;
  preflightIssues: FinalizePreflightIssue[];
  preflightFileCount: number;
  previewBlockingReason: string | null;
  finalizedPreviewFileCount: number;
  scaffoldRetry: ScaffoldRetrySuggestion | null;
  routePlan: RoutePlan | null | undefined;
}

export interface FinalizePreflightLogBundle {
  preflightErrors: FinalizePreflightIssue[];
  preflightWarnings: FinalizePreflightIssue[];
  hasVerificationBlockingPreflightErrors: boolean;
  hasPreviewBlockingPreflightErrors: boolean;
  preflightLogs: FinalizeVersionErrorLog[];
  preflightFailureSummary: string;
}

export function buildFinalizePreflightLogBundle({
  chatId,
  versionId,
  preflightIssues,
  preflightFileCount,
  previewBlockingReason,
  finalizedPreviewFileCount,
  scaffoldRetry,
  routePlan,
}: BuildFinalizePreflightLogBundleParams): FinalizePreflightLogBundle {
  const preflightErrors = preflightIssues.filter((issue) => issue.severity === "error");
  const preflightWarnings = preflightIssues.filter((issue) => issue.severity === "warning");
  const hasVerificationBlockingPreflightErrors = preflightErrors.length > 0;
  const hasPreviewBlockingPreflightErrors = Boolean(previewBlockingReason);

  const preflightLogs: FinalizeVersionErrorLog[] = [
    {
      chatId,
      versionId,
      level: preflightErrors.length > 0 ? "error" : "info",
      category: "preflight:summary",
      message:
        preflightErrors.length > 0
          ? "Automatic preflight found blocking issues."
          : "Automatic preflight completed.",
      meta: {
        filesChecked: preflightFileCount,
        issueCount: preflightIssues.length,
        errorCount: preflightErrors.length,
        warningCount: preflightWarnings.length,
        verificationBlocked: hasVerificationBlockingPreflightErrors,
        previewBlocked: hasPreviewBlockingPreflightErrors,
        previewBlockingReason,
        routePlan,
      },
    },
  ];

  if (preflightIssues.length > 0) {
    preflightLogs.push({
      chatId,
      versionId,
      level: preflightErrors.length > 0 ? "error" : "warning",
      category: "preflight:issues",
      message: "Automatic preflight reported issues.",
      meta: { issues: preflightIssues.slice(0, 20) },
    });
  }

  if (hasPreviewBlockingPreflightErrors) {
    preflightLogs.push({
      chatId,
      versionId,
      level: "error",
      category: "preview",
      message: previewBlockingReason ?? "Automatic preflight blocked preview creation.",
      meta: {
        source: "finalize-preflight",
        previewCode: "preflight_preview_blocked",
        previewStage: "preflight",
        previewBlocked: true,
        verificationBlocked: hasVerificationBlockingPreflightErrors,
      },
    });
  } else if (hasVerificationBlockingPreflightErrors) {
    preflightLogs.push({
      chatId,
      versionId,
      level: "warning",
      category: "preview",
      message: "Preview is available, but automatic preflight found verification-blocking issues.",
      meta: {
        source: "finalize-preflight",
        previewCode: "preflight_verification_blocked",
        previewStage: "preflight",
        previewBlocked: false,
        verificationBlocked: true,
        previewFileCount: finalizedPreviewFileCount,
      },
    });
  }

  if (scaffoldRetry) {
    preflightLogs.push({
      chatId,
      versionId,
      level: "warning",
      category: "scaffold",
      message: scaffoldRetry.reason,
      meta: {
        scaffoldRetry,
      },
    });
  }

  return {
    preflightErrors,
    preflightWarnings,
    hasVerificationBlockingPreflightErrors,
    hasPreviewBlockingPreflightErrors,
    preflightLogs,
    preflightFailureSummary: hasPreviewBlockingPreflightErrors
      ? "Automatic preflight found preview-blocking issues."
      : "Automatic preflight found verification-blocking issues.",
  };
}
