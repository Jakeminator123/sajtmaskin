import type { PreviewPreflightState } from "@/lib/gen/preview/diagnostics";
import { getRoutePlanPrimarySource, type PlannedRoute } from "@/lib/gen/route-plan";
import type { SanityIssue } from "@/lib/gen/validation/project-sanity";
import { formatChangeSteps } from "./post-checks-summary";
import {
  buildPreviewUnavailableLog,
  buildPreviewUnavailableStep,
  getPreviewBlockingReason,
  getPreviewUnavailableAutoFixReason,
  getPreviewUnavailableQualityGateFailure,
  isPreviewPendingInVm,
} from "./post-checks-preview";
import type { FileDiff } from "./post-checks-diff";
import type {
  SeoReview,
  SuspiciousUseCall,
} from "./post-checks-analysis";
import type {
  DesignTokenSummary,
  StreamQualitySignal,
  VersionErrorLogPayload,
} from "./types";
import type { QualityTier } from "@/lib/db/engine-version-lifecycle";
import type { ProductPostcheckResult } from "@/lib/gen/verify/product-postcheck";

export interface ImageValidationResult {
  valid?: boolean;
  total?: number;
  broken?: Array<{
    url: string;
    alt: string;
    file: string;
    status: number | string;
    replacementUrl: string | null;
  }>;
  replacedCount?: number;
  warnings?: string[];
  fixed?: boolean;
  demoUrl?: string;
}

export type { QualityTier };

export interface PostCheckArtifacts {
  finalDemoUrl: string | null;
  previewBlockingReason: string | null;
  readinessFailures: string[];
  readinessPassed: boolean;
  verifyPending: boolean;
  autoFixQueued: boolean;
  provisionalVersion: boolean;
  autoFixReasons: string[];
  warningReasons: string[];
  qualityTier: QualityTier;
  output: {
    steps: string[];
    summary: {
      files: number;
      added: number;
      modified: number;
      removed: number;
      warnings: number;
      provisional: boolean;
      /** @deprecated Renamed to verifyPending — kept for backward-compatible JSON. */
      // TODO(after-wave-5): drop after deadline 2026-Q3 if no inbound payloads.
      qualityGatePending: boolean;
      autoFixQueued: boolean;
      qualityTier: QualityTier;
      productBlocked: boolean;
    };
    preflight?: PreviewPreflightState | null;
    warnings: string[];
    sanityIssues: SanityIssue[];
    missingRoutes: string[];
    missingPlannedRoutes: PlannedRoute[];
    lucideLinkMisuse: string[];
    suspiciousUseCalls: SuspiciousUseCall[];
    designTokens: DesignTokenSummary | null;
    imageValidation: ImageValidationResult | null;
    productPostcheck: ProductPostcheckResult | null;
    previousVersionId: string | null;
    demoUrl: string | null;
    provisional: boolean;
    // TODO(after-wave-5): drop after deadline 2026-Q3 if no inbound payloads.
    qualityGatePending: boolean;
    autoFixQueued: boolean;
    qualityGate: {
      passed: boolean;
      failures: string[];
    };
    regressionMatrix: Array<{
      id: string;
      status: "manual" | "pass" | "fail";
      expectation: string;
    }>;
  };
  logItems: VersionErrorLogPayload[];
}

export function buildPostCheckArtifacts(params: {
  currentFileCount: number;
  versionId: string;
  changes: FileDiff | null;
  warnings: string[];
  preflight?: PreviewPreflightState | null;
  previousVersionId: string | null;
  streamQuality?: StreamQualitySignal;
  missingRoutes: string[];
  missingPlannedRoutes: PlannedRoute[];
  lucideLinkMisuse: string[];
  suspiciousUseCalls: SuspiciousUseCall[];
  designTokens: DesignTokenSummary | null;
  /** Advisory-only: feeds the `seo` error-log row, never the chat UI. */
  seoReview: SeoReview;
  sanityIssues: SanityIssue[];
  sanityErrors: SanityIssue[];
  sanityWarnings: SanityIssue[];
  imageValidation: ImageValidationResult | null;
  productPostcheck?: ProductPostcheckResult | null;
  resolvedDemoUrl: string | null;
}): PostCheckArtifacts {
  const {
    currentFileCount,
    versionId,
    changes,
    warnings,
    preflight,
    previousVersionId,
    streamQuality,
    missingRoutes,
    missingPlannedRoutes,
    lucideLinkMisuse,
    suspiciousUseCalls,
    designTokens,
    seoReview,
    sanityIssues,
    sanityErrors,
    sanityWarnings,
    imageValidation,
    productPostcheck = null,
    resolvedDemoUrl,
  } = params;

  const previewBlockingReason = getPreviewBlockingReason(preflight);
  const previewPendingInVm = isPreviewPendingInVm(preflight);
  const steps: string[] = [];

  if (changes) {
    steps.push(
      `Ändringar: +${changes.added.length} ~${changes.modified.length} -${changes.removed.length}`,
    );
    steps.push(...formatChangeSteps("Tillagda", changes.added, "+"));
    steps.push(...formatChangeSteps("Ändrade", changes.modified, "~"));
    steps.push(...formatChangeSteps("Borttagna", changes.removed, "-"));
  } else {
    steps.push("Ingen tidigare version att jämföra.");
  }

  if (warnings.length > 0) {
    steps.push(...warnings);
  }
  if (sanityErrors.length > 0) {
    const preview = sanityErrors
      .slice(0, 6)
      .map((issue) => `${issue.file}: ${issue.message}`)
      .join(" | ");
    const suffix = sanityErrors.length > 6 ? " …" : "";
    steps.push(`Kodsanity errors: ${preview}${suffix}`);
  }
  if (sanityWarnings.length > 0) {
    const preview = sanityWarnings
      .slice(0, 6)
      .map((issue) => `${issue.file}: ${issue.message}`)
      .join(" | ");
    const suffix = sanityWarnings.length > 6 ? " …" : "";
    steps.push(`Kodsanity warnings: ${preview}${suffix}`);
  }
  if (designTokens) {
    const names = designTokens.tokens.map((token) => token.name);
    const preview = names.slice(0, 8).join(", ");
    const suffix = names.length > 8 ? " …" : "";
    steps.push(`Design tokens (${designTokens.source}): ${preview}${suffix}`);
  }
  // SEO/analytics/editorial/business reviews were removed from the chat
  // post-check steps 2026-07-23: they are pure optimization advice, never
  // Blockers, and drowned the real signals. SEO lives on as an error-log row
  // (launch readiness) and as the opt-in in the Publicera dialog.

  if (imageValidation?.broken?.length) {
    const brokenCount = imageValidation.broken.length;
    const fixedCount = imageValidation.replacedCount ?? 0;
    steps.push(
      `Bilder: ${brokenCount} trasig(a) URL:er hittade${fixedCount > 0 ? `, ${fixedCount} ersatt(a) med Unsplash-alternativ` : ""}`,
    );
  } else if (imageValidation?.total && imageValidation.total > 0) {
    steps.push(`Bilder: alla ${imageValidation.total} URL:er giltiga ✓`);
  }
  if (productPostcheck?.productBlocked) {
    steps.push("Produktkontroll: blockerande synliga produktproblem hittades.");
  }

  const finalDemoUrl = imageValidation?.demoUrl || resolvedDemoUrl;
  if (!finalDemoUrl) {
    steps.push(buildPreviewUnavailableStep(preflight));
  }
  if (preflight?.previewStart?.hasCriticalInstallRisk) {
    steps.push("Preview readiness: package/dependency-risk blocker upptäckt före live-preview.");
  }
  if (preflight?.previewStart?.requiresEnvConfig) {
    steps.push("Preview readiness: live-preview väntar på projektets miljövariabler eller secrets.");
  }
  if (preflight?.previewStart?.hasCriticalCodeFailure) {
    steps.push("Preview readiness: kodstrukturen blockerar live-preview tills preflightfel är lösta.");
  }
  if (preflight?.scaffoldRetry) {
    steps.push(
      `Scaffold retry: byt från ${preflight.scaffoldRetry.currentScaffoldLabel} till ${preflight.scaffoldRetry.suggestedScaffoldLabel} om repair-turnen behöver en strukturpivot.`,
    );
  }
  if (missingPlannedRoutes.length > 0) {
    const preview = missingPlannedRoutes
      .slice(0, 6)
      .map((route) => `${route.path} (${route.name})`)
      .join(" | ");
    const suffix = missingPlannedRoutes.length > 6 ? " …" : "";
    steps.push(`Route plan mismatch: ${preview}${suffix}`);
  }

  const changedFilesCount = changes
    ? changes.added.length + changes.modified.length + changes.removed.length
    : 1;
  const readinessFailures: string[] = [];
  if (changedFilesCount === 0) {
    readinessFailures.push("no_file_changes");
  }
  if (!finalDemoUrl && !previewPendingInVm) {
    readinessFailures.push(getPreviewUnavailableQualityGateFailure(preflight));
  }
  if (streamQuality?.hasCriticalAnomaly) {
    readinessFailures.push(`stream_anomaly:${streamQuality.reasons.join(",")}`);
  }
  if (lucideLinkMisuse.length > 0) {
    readinessFailures.push("invalid_link_import");
  }
  if (sanityErrors.length > 0) {
    readinessFailures.push("project_sanity_errors");
  }
  if (preflight?.previewStart?.hasCriticalInstallRisk) {
    readinessFailures.push("dependency_install_failure");
  }
  if (preflight?.previewStart?.requiresEnvConfig) {
    readinessFailures.push("env_config_missing");
  }
  if (
    missingPlannedRoutes.length > 0 &&
    getRoutePlanPrimarySource(preflight?.routePlan) === "brief" &&
    !finalDemoUrl
  ) {
    readinessFailures.push("planned_routes_missing");
  }

  const readinessPassed = readinessFailures.length === 0;

  const criticalReasons: string[] = [];
  if (!finalDemoUrl && !previewPendingInVm && !preflight?.previewStart?.requiresEnvConfig) {
    criticalReasons.push(getPreviewUnavailableAutoFixReason(preflight));
  }
  if (preflight?.previewStart?.hasCriticalInstallRisk) {
    criticalReasons.push("dependency/install-risk");
  }
  if (preflight?.previewStart?.hasCriticalCodeFailure) {
    criticalReasons.push("kodstruktur blockerar live-preview");
  }
  if (sanityErrors.length > 0) criticalReasons.push("kodsanity error");
  const shouldEscalateScaffoldRetry =
    Boolean(preflight?.scaffoldRetry) &&
    (Boolean(previewBlockingReason) || sanityErrors.length > 0);
  if (shouldEscalateScaffoldRetry) criticalReasons.push("misstänkt scaffold-mismatch");
  if (
    missingPlannedRoutes.length > 0 &&
    getRoutePlanPrimarySource(preflight?.routePlan) === "brief" &&
    !finalDemoUrl &&
    sanityErrors.length > 0
  ) {
    criticalReasons.push("planerade routes saknas");
  }

  const warningReasons: string[] = [];
  if (missingRoutes.length > 0) warningReasons.push("saknade routes");
  if (preflight?.previewStart?.requiresEnvConfig) warningReasons.push("miljövariabler saknas");
  if (missingPlannedRoutes.length > 0 && getRoutePlanPrimarySource(preflight?.routePlan) !== "brief") {
    warningReasons.push("route-plan mismatch");
  }
  if (missingPlannedRoutes.length > 0 && getRoutePlanPrimarySource(preflight?.routePlan) === "brief") {
    warningReasons.push("planerade routes saknas");
  }
  if (preflight?.scaffoldRetry && !shouldEscalateScaffoldRetry) {
    warningReasons.push("misstänkt scaffold-mismatch");
  }
  if (lucideLinkMisuse.length > 0) warningReasons.push("fel Link-import");
  if (suspiciousUseCalls.length > 0) warningReasons.push("misstankt use()");
  if (imageValidation?.broken?.length) warningReasons.push("trasiga bilder");
  if (imageValidation?.warnings?.some((warning) => warning.includes("[semantic-image]"))) {
    warningReasons.push("misstankt irrelevanta bilder");
  }
  if (productPostcheck?.productBlocked) warningReasons.push("produktkontroll blockerar F3");

  // M#dgc (WP4 residual): degenerate/oversized output is terminally failed
  // server-side by the degeneracy guard and is by definition NOT client-
  // repairable — an autofix retry re-enters the same guard, burns one of the
  // capped retries and churns the pipeline. Report the failure truthfully but
  // never QUEUE an autofix for it.
  const degenerateOutputBlocked =
    typeof previewBlockingReason === "string" &&
    previewBlockingReason.startsWith("Degenerate output blocked");
  const autoFixReasons = degenerateOutputBlocked ? [] : criticalReasons;
  const autoFixQueued = autoFixReasons.length > 0;
  const verifyPending = criticalReasons.length === 0;
  const provisionalVersion = !readinessPassed || verifyPending || autoFixQueued;

  const qualityTier: QualityTier =
    (!finalDemoUrl && !previewPendingInVm) || criticalReasons.length > 0
      ? "none"
      : readinessPassed && warningReasons.length === 0
        ? "tier2"
        : "preview";

  const preflightOnlyFailures = readinessFailures.filter((failure) =>
    failure === "preflight_preview_blocked" ||
    failure === "missing_preview_url" ||
    failure === "preview_waiting_for_vm" ||
    failure === "dependency_install_failure" ||
    failure === "env_config_missing",
  );
  steps.push(
    readinessPassed
      ? "Readiness: PASS (changes + preview + stream quality)."
      : autoFixQueued && preflightOnlyFailures.length === readinessFailures.length
        ? `Preflight blocker: ${readinessFailures.join(" | ")}. Verify-lane körs efter fix.`
        : `Readiness: FAIL (${readinessFailures.join(" | ")}).`,
  );

  const regressionMatrix = [
    {
      id: "A_long_prompt_plan_mode",
      status: "manual" as const,
      expectation: "No aggressive truncation; plan remains concise and complete.",
    },
    {
      id: "B_model_tier_change_mid_session",
      status: "manual" as const,
      expectation: "Model resolution stays deterministic without stale custom overrides.",
    },
    {
      id: "C_images_on_off_and_blob_on_off",
      status:
        imageValidation?.broken?.length && imageValidation.broken.length > 0
          ? ("fail" as const)
          : ("pass" as const),
      expectation: "Image flow reflects AI toggle + blob availability in preview.",
    },
    {
      id: "D_missing_version_or_demo_from_stream",
      status: finalDemoUrl ? ("pass" as const) : ("fail" as const),
      expectation: "Stream finalization surfaces explicit fallback/retry state.",
    },
  ];

  const output = {
    steps,
    summary: {
      files: currentFileCount,
      added: changes?.added.length ?? 0,
      modified: changes?.modified.length ?? 0,
      removed: changes?.removed.length ?? 0,
      warnings: warnings.length,
      provisional: provisionalVersion,
      qualityGatePending: verifyPending,
      autoFixQueued,
      qualityTier,
      productBlocked: productPostcheck?.productBlocked === true,
    },
    preflight,
    warnings,
    sanityIssues,
    missingRoutes,
    missingPlannedRoutes,
    lucideLinkMisuse,
    suspiciousUseCalls,
    designTokens,
    imageValidation,
    productPostcheck,
    previousVersionId,
    demoUrl: finalDemoUrl,
    provisional: provisionalVersion,
    qualityGatePending: verifyPending,
    autoFixQueued,
    qualityGate: {
      passed: readinessPassed,
      failures: readinessFailures,
    },
    regressionMatrix,
  };

  const logItems: VersionErrorLogPayload[] = [];
  if (!finalDemoUrl && !previewPendingInVm) {
    logItems.push(buildPreviewUnavailableLog(versionId, preflight));
  }
  if (missingRoutes.length > 0) {
    logItems.push({
      level: "warning",
      category: "routes",
      message: "Saknade interna routes.",
      meta: { missingRoutes },
    });
  }
  if (missingPlannedRoutes.length > 0) {
    logItems.push({
      level: getRoutePlanPrimarySource(preflight?.routePlan) === "brief" ? "error" : "warning",
      category: "route-plan",
      message: "Planerade routes saknas i den genererade versionen.",
      meta: {
        source: getRoutePlanPrimarySource(preflight?.routePlan),
        siteType: preflight?.routePlan?.siteType ?? null,
        missingPlannedRoutes,
      },
    });
  }
  if (suspiciousUseCalls.length > 0) {
    logItems.push({
      level: "warning",
      category: "react",
      message: "Misstankt React use()-anvandning.",
      meta: { suspiciousUseCalls },
    });
  }
  if (lucideLinkMisuse.length > 0) {
    logItems.push({
      level: "warning",
      category: "navigation",
      message: "Felaktig Link-import upptackt.",
      meta: { files: lucideLinkMisuse },
    });
  }
  if (sanityErrors.length > 0 || sanityWarnings.length > 0) {
    logItems.push({
      level: sanityErrors.length > 0 ? "error" : "warning",
      category: "project-sanity",
      message: "Kodsanity rapporterade problem.",
      meta: { issues: sanityIssues.slice(0, 20) },
    });
  }
  if (!seoReview.passed) {
    // Advisory-only row: launch readiness (`buildSeoAdvisoriesFromMeta`) and
    // VersionDiagnosticsDialog read this — it never surfaces in the chat.
    logItems.push({
      level: "warning",
      category: "seo",
      message: `SEO review hittade ${seoReview.issues.length} launch-varning(ar).`,
      meta: {
        issues: seoReview.issues,
        signals: seoReview.signals,
      },
    });
  }
  if (imageValidation?.broken?.length) {
    logItems.push({
      level: "warning",
      category: "images",
      message: "Trasiga bild-URL:er hittade.",
      meta: {
        broken: imageValidation.broken,
        replacedCount: imageValidation.replacedCount ?? 0,
      },
    });
  }
  if (imageValidation?.warnings?.length) {
    logItems.push({
      level: "warning",
      category: "images",
      message: "Bildvalidering rapporterade varningar.",
      meta: { warnings: imageValidation.warnings },
    });
  }
  if (!readinessPassed) {
    logItems.push({
      level: "error",
      category: "quality-gate",
      message: "Readiness check failed after generation.",
      meta: { failures: readinessFailures },
    });
  }

  return {
    finalDemoUrl,
    previewBlockingReason,
    readinessFailures,
    readinessPassed,
    verifyPending,
    autoFixQueued,
    provisionalVersion,
    autoFixReasons,
    warningReasons,
    qualityTier,
    output,
    logItems,
  };
}
