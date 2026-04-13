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
  AnalyticsReview,
  BusinessWorkflowReview,
  EditorialReview,
  SeoIssue,
  SeoReview,
  SuspiciousUseCall,
} from "./post-checks-analysis";
import type {
  DesignTokenSummary,
  StreamQualitySignal,
  VersionErrorLogPayload,
} from "./types";
import type { QualityTier } from "@/lib/db/engine-version-lifecycle";

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
      qualityGatePending: boolean;
      autoFixQueued: boolean;
      qualityTier: QualityTier;
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
    previousVersionId: string | null;
    demoUrl: string | null;
    provisional: boolean;
    qualityGatePending: boolean;
    autoFixQueued: boolean;
    qualityGate: {
      passed: boolean;
      failures: string[];
    };
    analyticsReview: AnalyticsReview;
    analyticsSummary: {
      passed: boolean;
      issueCount: number;
      topIssues: string[];
      suggestedPrompts: string[];
      suggestedLabels: string[];
      trackerDetected: boolean;
      trackerProviders: string[];
      conversionSurfaceCount: number;
      conversionEventCount: number;
    };
    editorialReview: EditorialReview;
    editorialSummary: {
      packCount: number;
      labels: string[];
      suggestedPrompts: string[];
      hasBlogCollection: boolean;
      hasContactFlow: boolean;
    };
    businessWorkflowReview: BusinessWorkflowReview;
    businessWorkflowSummary: {
      packCount: number;
      labels: string[];
      suggestedPrompts: string[];
      recommendedIntegrations: string[];
      hasLeadCapture: boolean;
      hasBookingFlow: boolean;
      hasCrmSync: boolean;
    };
    seoReview: SeoReview;
    seoSummary: {
      passed: boolean;
      issueCount: number;
      topIssues: string[];
      suggestedPrompts: string[];
      suggestedLabels: string[];
      canonical: boolean;
      ogImage: boolean;
      homeH1Count: number | null;
    };
    regressionMatrix: Array<{
      id: string;
      status: "manual" | "pass" | "fail";
      expectation: string;
    }>;
  };
  logItems: VersionErrorLogPayload[];
}

function summarizeSeoSignals(seoReview: SeoReview) {
  const issueCodes = new Set<SeoIssue["code"]>(seoReview.issues.map((issue) => issue.code));
  const suggestedPrompts: string[] = [];
  const suggestedLabels: string[] = [];

  const pushPrompt = (condition: boolean, label: string, prompt: string) => {
    if (!condition) return;
    if (!suggestedPrompts.includes(prompt)) {
      suggestedPrompts.push(prompt);
      suggestedLabels.push(label);
    }
  };
  const hasAnyIssue = (...codes: SeoIssue["code"][]) => codes.some((code) => issueCodes.has(code));

  pushPrompt(
    hasAnyIssue("missing-metadata", "missing-title", "missing-description"),
    "metadata",
    "Fyll ut metadata för sajten med title och description utan att ändra sidlayouten.",
  );
  pushPrompt(
    issueCodes.has("missing-canonical"),
    "canonical",
    "Lägg till en canonical-strategi i metadata för sajten utan att ändra designen i övrigt.",
  );
  pushPrompt(
    hasAnyIssue("missing-open-graph", "missing-og-image", "missing-twitter"),
    "social",
    "Komplettera social metadata med Open Graph, bildstrategi och Twitter-kort utan att ändra layouten.",
  );
  pushPrompt(
    issueCodes.has("missing-robots") || issueCodes.has("missing-sitemap"),
    "robots",
    "Lägg till robots.ts och sitemap.ts med rimliga standarder för indexering utan att ändra designen.",
  );
  pushPrompt(
    issueCodes.has("missing-json-ld"),
    "schema",
    "Lägg till grundläggande JSON-LD/schema.org-markup för sajten utan att ändra den visuella designen.",
  );
  pushPrompt(
    issueCodes.has("missing-h1") || issueCodes.has("multiple-h1") || issueCodes.has("heading-hierarchy"),
    "rubriker",
    "Rätta h1 och rubrikhierarkin så att SEO-strukturen blir konsekvent utan att göra en redesign.",
  );

  return {
    passed: seoReview.passed,
    issueCount: seoReview.issues.length,
    topIssues: seoReview.issues.slice(0, 5).map((issue) => issue.message),
    suggestedPrompts: suggestedPrompts.slice(0, 4),
    suggestedLabels: suggestedLabels.slice(0, 4),
    canonical: seoReview.signals.canonical,
    ogImage: seoReview.signals.ogImage,
    homeH1Count: seoReview.signals.homeH1Count,
  };
}

function summarizeAnalyticsSignals(analyticsReview: AnalyticsReview) {
  const suggestedPrompts: string[] = [];
  const suggestedLabels: string[] = [];
  const pushPrompt = (condition: boolean, label: string, prompt: string) => {
    if (!condition) return;
    if (!suggestedPrompts.includes(prompt)) {
      suggestedPrompts.push(prompt);
      suggestedLabels.push(label);
    }
  };

  pushPrompt(
    analyticsReview.issues.some((issue) => issue.code === "missing-analytics-tracker"),
    "tracking",
    "Lägg till en analytics-tracker för sajten och behåll resten av layouten oförändrad.",
  );
  pushPrompt(
    analyticsReview.issues.some((issue) => issue.code === "missing-conversion-events"),
    "events",
    "Lägg till tydliga konverteringsevents för formulär och CTA-flöden utan att ändra designen.",
  );

  return {
    passed: analyticsReview.passed,
    issueCount: analyticsReview.issues.length,
    topIssues: analyticsReview.issues.slice(0, 4).map((issue) => issue.message),
    suggestedPrompts: suggestedPrompts.slice(0, 4),
    suggestedLabels: suggestedLabels.slice(0, 4),
    trackerDetected: analyticsReview.signals.trackerDetected,
    trackerProviders: analyticsReview.signals.trackerProviders,
    conversionSurfaceCount: analyticsReview.signals.conversionSurfaceCount,
    conversionEventCount: analyticsReview.signals.conversionEventCount,
  };
}

function summarizeEditorialSignals(editorialReview: EditorialReview) {
  const topPacks = editorialReview.packs.slice(0, 4);
  return {
    packCount: editorialReview.packs.length,
    labels: topPacks.map((pack) => pack.label),
    suggestedPrompts: topPacks.map((pack) => pack.suggestedPrompt),
    hasBlogCollection: editorialReview.signals.hasBlogCollection,
    hasContactFlow: editorialReview.signals.hasContactFlow,
  };
}

function summarizeBusinessWorkflowSignals(businessWorkflowReview: BusinessWorkflowReview) {
  const topPacks = businessWorkflowReview.packs.slice(0, 4);
  return {
    packCount: businessWorkflowReview.packs.length,
    labels: topPacks.map((pack) => pack.label),
    suggestedPrompts: topPacks.map((pack) => pack.suggestedPrompt),
    recommendedIntegrations: Array.from(
      new Set(businessWorkflowReview.packs.flatMap((pack) => pack.recommendedIntegrations)),
    ),
    hasLeadCapture: businessWorkflowReview.signals.hasLeadCapture,
    hasBookingFlow: businessWorkflowReview.signals.hasBookingFlow,
    hasCrmSync: businessWorkflowReview.signals.hasCrmSync,
  };
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
  seoReview: SeoReview;
  analyticsReview: AnalyticsReview;
  editorialReview: EditorialReview;
  businessWorkflowReview: BusinessWorkflowReview;
  sanityIssues: SanityIssue[];
  sanityErrors: SanityIssue[];
  sanityWarnings: SanityIssue[];
  imageValidation: ImageValidationResult | null;
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
    analyticsReview,
    editorialReview,
    businessWorkflowReview,
    sanityIssues,
    sanityErrors,
    sanityWarnings,
    imageValidation,
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
  if (seoReview.passed) {
    steps.push("SEO: metadata, robots, sitemap och grundlaggande struktur ser bra ut.");
  } else {
    steps.push(`SEO: ${seoReview.issues.length} launch-varning(ar) hittades.`);
    steps.push(
      ...seoReview.issues
        .slice(0, 6)
        .map((issue) => (issue.file ? `${issue.message} (${issue.file})` : issue.message)),
    );
  }
  if (!analyticsReview.passed) {
    steps.push(`Analytics: ${analyticsReview.issues.length} tracking-varning(ar) hittades.`);
    steps.push(
      ...analyticsReview.issues
        .slice(0, 4)
        .map((issue) => (issue.file ? `${issue.message} (${issue.file})` : issue.message)),
    );
  }
  if (editorialReview.packs.length > 0) {
    const labels = editorialReview.packs.slice(0, 6).map((pack) => pack.label).join(", ");
    const suffix = editorialReview.packs.length > 6 ? " …" : "";
    steps.push(`Editorial mode: upptäckte redigerbara innehållspack för ${labels}${suffix}.`);
  }
  if (businessWorkflowReview.packs.length > 0) {
    const labels = businessWorkflowReview.packs.slice(0, 6).map((pack) => pack.label).join(", ");
    const suffix = businessWorkflowReview.packs.length > 6 ? " …" : "";
    steps.push(`Business workflows: ${labels}${suffix}.`);
  }

  if (imageValidation?.broken?.length) {
    const brokenCount = imageValidation.broken.length;
    const fixedCount = imageValidation.replacedCount ?? 0;
    steps.push(
      `Bilder: ${brokenCount} trasig(a) URL:er hittade${fixedCount > 0 ? `, ${fixedCount} ersatt(a) med Unsplash-alternativ` : ""}`,
    );
  } else if (imageValidation?.total && imageValidation.total > 0) {
    steps.push(`Bilder: alla ${imageValidation.total} URL:er giltiga ✓`);
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

  const autoFixReasons = criticalReasons;
  const autoFixQueued = criticalReasons.length > 0;
  const verifyPending = !autoFixQueued;
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
    previousVersionId,
    demoUrl: finalDemoUrl,
    provisional: provisionalVersion,
    qualityGatePending: verifyPending,
    autoFixQueued,
    qualityGate: {
      passed: readinessPassed,
      failures: readinessFailures,
    },
    analyticsReview,
    analyticsSummary: summarizeAnalyticsSignals(analyticsReview),
    editorialReview,
    editorialSummary: summarizeEditorialSignals(editorialReview),
    businessWorkflowReview,
    businessWorkflowSummary: summarizeBusinessWorkflowSignals(businessWorkflowReview),
    seoReview,
    seoSummary: summarizeSeoSignals(seoReview),
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
  if (!analyticsReview.passed) {
    logItems.push({
      level: "info",
      category: "analytics",
      message: `Analytics review hittade ${analyticsReview.issues.length} observationer.`,
      meta: {
        issues: analyticsReview.issues,
        signals: analyticsReview.signals,
      },
    });
  }
  if (editorialReview.packs.length > 0) {
    logItems.push({
      level: "info",
      category: "editorial",
      message: `Editorial inventory hittade ${editorialReview.packs.length} redigerbara innehållspack.`,
      meta: {
        packs: editorialReview.packs,
        signals: editorialReview.signals,
      },
    });
  }
  if (businessWorkflowReview.packs.length > 0) {
    logItems.push({
      level: "info",
      category: "business-workflows",
      message: `Business workflow inventory hittade ${businessWorkflowReview.packs.length} affärspack.`,
      meta: {
        packs: businessWorkflowReview.packs,
        signals: businessWorkflowReview.signals,
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
