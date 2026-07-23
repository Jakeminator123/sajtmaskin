import { describe, expect, it } from "vitest";
import { buildPostCheckArtifacts } from "./post-checks-results";
import type { SeoReview } from "./post-checks-analysis";

const emptySeoReview: SeoReview = {
  passed: true,
  issues: [],
  signals: {
    metadata: true,
    title: true,
    description: true,
    canonical: true,
    openGraph: true,
    ogImage: true,
    twitter: true,
    robots: true,
    sitemap: true,
    jsonLd: true,
    homeH1Count: 1,
  },
};

describe("post-checks-results", () => {
  it("describes preflight blockers without pretending quality gate already ran", () => {
    const artifacts = buildPostCheckArtifacts({
      currentFileCount: 2,
      versionId: "ver_test",
      changes: null,
      warnings: [],
      preflight: {
        previewBlocked: true,
        verificationBlocked: true,
        previewBlockingReason: "Generated files still contain blocking syntax errors.",
        previewStart: {
          canStartPreview: false,
          primaryPreviewTarget: "none",
          shimBlocked: false,
          requiresEnvConfig: false,
          hasCriticalInstallRisk: false,
          hasCriticalCodeFailure: true,
          compatibilityPreviewAllowed: false,
          issueCounts: {
            code_structure_failure: 2,
            dependency_install_failure: 0,
            env_config_missing: 0,
            shim_preview_failure: 0,
            non_blocking_quality_warning: 0,
          },
          blockingCategories: ["code_structure_failure"],
        },
      },
      previousVersionId: null,
      streamQuality: undefined,
      missingRoutes: [],
      missingPlannedRoutes: [],
      lucideLinkMisuse: [],
      suspiciousUseCalls: [],
      designTokens: null,
      seoReview: emptySeoReview,
      sanityIssues: [],
      sanityErrors: [],
      sanityWarnings: [],
      imageValidation: null,
      resolvedDemoUrl: null,
    });

    expect(artifacts.output.steps).toContain(
      "Preflight blocker: preflight_preview_blocked. Verify-lane körs efter fix.",
    );
  });

  it("does NOT queue client autofix for degenerate output (M#dgc)", () => {
    const artifacts = buildPostCheckArtifacts({
      currentFileCount: 2,
      versionId: "ver_test",
      changes: null,
      warnings: [],
      preflight: {
        previewBlocked: true,
        verificationBlocked: true,
        previewBlockingReason:
          "Degenerate output blocked: file components/credential-deck.tsx exceeds 768KB",
        previewStart: {
          canStartPreview: false,
          primaryPreviewTarget: "none",
          shimBlocked: false,
          requiresEnvConfig: false,
          hasCriticalInstallRisk: false,
          hasCriticalCodeFailure: true,
          compatibilityPreviewAllowed: false,
          issueCounts: {
            code_structure_failure: 1,
            dependency_install_failure: 0,
            env_config_missing: 0,
            shim_preview_failure: 0,
            non_blocking_quality_warning: 0,
          },
          blockingCategories: ["code_structure_failure"],
        },
      },
      previousVersionId: null,
      streamQuality: undefined,
      missingRoutes: [],
      missingPlannedRoutes: [],
      lucideLinkMisuse: [],
      suspiciousUseCalls: [],
      designTokens: null,
      seoReview: emptySeoReview,
      sanityIssues: [],
      sanityErrors: [],
      sanityWarnings: [],
      imageValidation: null,
      resolvedDemoUrl: null,
    });

    // The failure is still reported truthfully…
    expect(artifacts.readinessPassed).toBe(false);
    expect(artifacts.readinessFailures.length).toBeGreaterThan(0);
    // …but no client autofix is queued: the degeneracy guard terminally failed
    // the version server-side and a retry just re-enters the same guard.
    expect(artifacts.autoFixReasons).toEqual([]);
    expect(artifacts.autoFixQueued).toBe(false);
    // Not marked verify-pending either — the version is terminally failed.
    expect(artifacts.verifyPending).toBe(false);
  });

  it("keeps scaffold retry and planned routes as warnings when preview already exists", () => {
    const artifacts = buildPostCheckArtifacts({
      currentFileCount: 4,
      versionId: "ver_test",
      changes: null,
      warnings: [],
      preflight: {
        previewBlocked: false,
        verificationBlocked: true,
        previewBlockingReason: null,
        scaffoldRetry: {
          currentScaffoldId: "ecommerce",
          currentScaffoldLabel: "E-handel",
          suggestedScaffoldId: "saas-landing",
          suggestedScaffoldLabel: "SaaS Landing",
          failureType: "blocking-preflight",
          reason: "Preflight-blockeringen tyder på att E-handel kan vara en svag scaffold-fit.",
          source: "heuristic",
          confidence: "medium",
        },
        routePlan: {
          provenance: { primarySource: "brief", sources: ["brief"] },
          siteType: "brochure",
          reason: "Prompten antydde flera routes.",
          routes: [
            { path: "/butik", name: "Butik", intent: "shop", required: true },
          ],
        },
      },
      previousVersionId: null,
      streamQuality: undefined,
      missingRoutes: [],
      missingPlannedRoutes: [{ path: "/butik", name: "Butik", intent: "shop", required: true }],
      lucideLinkMisuse: [],
      suspiciousUseCalls: [],
      designTokens: null,
      seoReview: emptySeoReview,
      sanityIssues: [],
      sanityErrors: [],
      sanityWarnings: [],
      imageValidation: null,
      resolvedDemoUrl: "https://preview.example/ver_test",
    });

    expect(artifacts.autoFixReasons).toEqual([]);
    expect(artifacts.warningReasons).toEqual(
      expect.arrayContaining(["misstänkt scaffold-mismatch", "planerade routes saknas"]),
    );
  });

  it("writes the advisory seo error-log row but keeps SEO out of the chat steps", () => {
    const artifacts = buildPostCheckArtifacts({
      currentFileCount: 1,
      versionId: "ver_test",
      changes: null,
      warnings: [],
      preflight: null,
      previousVersionId: null,
      streamQuality: undefined,
      missingRoutes: [],
      missingPlannedRoutes: [],
      lucideLinkMisuse: [],
      suspiciousUseCalls: [],
      designTokens: null,
      seoReview: {
        passed: false,
        issues: [
          {
            severity: "warning",
            code: "missing-metadata",
            message: "Layouten saknar export av metadata för title/description.",
            file: "app/layout.tsx",
          },
        ],
        signals: {
          metadata: false,
          title: false,
          description: false,
          canonical: false,
          openGraph: false,
          ogImage: false,
          twitter: false,
          robots: false,
          sitemap: false,
          jsonLd: false,
          homeH1Count: 1,
        },
      },
      sanityIssues: [],
      sanityErrors: [],
      sanityWarnings: [],
      imageValidation: null,
      resolvedDemoUrl: "https://preview.example/ver_test",
    });

    // Advisory row persists (launch readiness reads it) …
    const seoLog = artifacts.logItems.find((item) => item.category === "seo");
    expect(seoLog).toBeDefined();
    expect(seoLog?.level).toBe("warning");
    // … but the chat post-check steps and warning reasons stay SEO-free.
    expect(artifacts.output.steps.some((step) => step.includes("SEO"))).toBe(false);
    expect(artifacts.warningReasons).toEqual([]);
  });
});
