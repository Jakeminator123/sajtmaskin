import type { PreviewPreflightState } from "@/lib/gen/preview-diagnostics";
import type { SanityIssue } from "@/lib/gen/validation/project-sanity";
import { formatChangeSteps } from "./post-checks-summary";
import {
  buildPreviewUnavailableLog,
  buildPreviewUnavailableStep,
  getPreviewBlockingReason,
  getPreviewUnavailableAutoFixReason,
  getPreviewUnavailableQualityGateFailure,
} from "./post-checks-preview";
import type { FileDiff } from "./post-checks-diff";
import type { SeoReview, SuspiciousUseCall } from "./post-checks-analysis";
import type {
  DesignTokenSummary,
  StreamQualitySignal,
  VersionErrorLogPayload,
} from "./types";

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

export type QualityTier = "none" | "preview" | "sandbox" | "production";

export interface PostCheckArtifacts {
  finalDemoUrl: string | null;
  previewBlockingReason: string | null;
  qualityGateFailures: string[];
  qualityGatePassed: boolean;
  qualityGatePending: boolean;
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
      qualityGatePending: boolean;
      autoFixQueued: boolean;
      qualityTier: QualityTier;
    };
    preflight?: PreviewPreflightState | null;
    warnings: string[];
    sanityIssues: SanityIssue[];
    missingRoutes: string[];
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
    seoReview: SeoReview;
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
  lucideLinkMisuse: string[];
  suspiciousUseCalls: SuspiciousUseCall[];
  designTokens: DesignTokenSummary | null;
  seoReview: SeoReview;
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
    lucideLinkMisuse,
    suspiciousUseCalls,
    designTokens,
    seoReview,
    sanityIssues,
    sanityErrors,
    sanityWarnings,
    imageValidation,
    resolvedDemoUrl,
  } = params;

  const previewBlockingReason = getPreviewBlockingReason(preflight);
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

  const changedFilesCount = changes
    ? changes.added.length + changes.modified.length + changes.removed.length
    : 1;
  const qualityGateFailures: string[] = [];
  if (changedFilesCount === 0) {
    qualityGateFailures.push("no_file_changes");
  }
  if (!finalDemoUrl) {
    qualityGateFailures.push(getPreviewUnavailableQualityGateFailure(preflight));
  }
  if (streamQuality?.hasCriticalAnomaly) {
    qualityGateFailures.push(`stream_anomaly:${streamQuality.reasons.join(",")}`);
  }
  if (lucideLinkMisuse.length > 0) {
    qualityGateFailures.push("invalid_link_import");
  }
  if (sanityErrors.length > 0) {
    qualityGateFailures.push("project_sanity_errors");
  }

  const qualityGatePassed = qualityGateFailures.length === 0;

  const criticalReasons: string[] = [];
  if (!finalDemoUrl) {
    criticalReasons.push(getPreviewUnavailableAutoFixReason(preflight));
  }
  if (sanityErrors.length > 0) criticalReasons.push("kodsanity error");

  const warningReasons: string[] = [];
  if (missingRoutes.length > 0) warningReasons.push("saknade routes");
  if (lucideLinkMisuse.length > 0) warningReasons.push("fel Link-import");
  if (suspiciousUseCalls.length > 0) warningReasons.push("misstankt use()");
  if (imageValidation?.broken?.length) warningReasons.push("trasiga bilder");
  if (imageValidation?.warnings?.some((warning) => warning.includes("[semantic-image]"))) {
    warningReasons.push("misstankt irrelevanta bilder");
  }

  const autoFixReasons = criticalReasons;
  const autoFixQueued = criticalReasons.length > 0;
  const qualityGatePending = !autoFixQueued;
  const provisionalVersion = !qualityGatePassed || qualityGatePending || autoFixQueued;

  const qualityTier: QualityTier =
    !finalDemoUrl || criticalReasons.length > 0
      ? "none"
      : qualityGatePassed && warningReasons.length === 0
        ? "sandbox"
        : "preview";

  steps.push(
    qualityGatePassed
      ? "Quality gate: PASS (changes + preview + stream quality)."
      : `Quality gate: FAIL (${qualityGateFailures.join(" | ")}).`,
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
      qualityGatePending,
      autoFixQueued,
      qualityTier,
    },
    preflight,
    warnings,
    sanityIssues,
    missingRoutes,
    lucideLinkMisuse,
    suspiciousUseCalls,
    designTokens,
    imageValidation,
    previousVersionId,
    demoUrl: finalDemoUrl,
    provisional: provisionalVersion,
    qualityGatePending,
    autoFixQueued,
    qualityGate: {
      passed: qualityGatePassed,
      failures: qualityGateFailures,
    },
    seoReview,
    regressionMatrix,
  };

  const logItems: VersionErrorLogPayload[] = [];
  if (!finalDemoUrl) {
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
  if (!qualityGatePassed) {
    logItems.push({
      level: "error",
      category: "quality-gate",
      message: "Quality gate failed after generation.",
      meta: { failures: qualityGateFailures },
    });
  }

  return {
    finalDemoUrl,
    previewBlockingReason,
    qualityGateFailures,
    qualityGatePassed,
    qualityGatePending,
    autoFixQueued,
    provisionalVersion,
    autoFixReasons,
    warningReasons,
    qualityTier,
    output,
    logItems,
  };
}
