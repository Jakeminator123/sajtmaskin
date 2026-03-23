import { describe, expect, it } from "vitest";
import { buildPostCheckArtifacts } from "./post-checks-results";
import type {
  AnalyticsReview,
  BusinessWorkflowReview,
  EditorialReview,
  SeoReview,
} from "./post-checks-analysis";

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

const emptyAnalyticsReview: AnalyticsReview = {
  passed: true,
  issues: [],
  signals: {
    trackerDetected: true,
    trackerProviders: ["vercel"],
    conversionSurfaceCount: 1,
    conversionEventCount: 1,
  },
};

function buildArtifacts(params: {
  editorialReview?: EditorialReview;
  businessWorkflowReview?: BusinessWorkflowReview;
  resolvedDemoUrl?: string | null;
  preflight?: { previewBlocked: boolean; verificationBlocked: boolean; previewBlockingReason: string | null } | null;
  runtimePreviewState?: "pending" | "skipped" | null;
}) {
  return buildPostCheckArtifacts({
    currentFileCount: 1,
    versionId: "ver_test",
    changes: null,
    warnings: [],
    preflight: params.preflight ?? null,
    previousVersionId: null,
    streamQuality: undefined,
    missingRoutes: [],
    missingPlannedRoutes: [],
    lucideLinkMisuse: [],
    suspiciousUseCalls: [],
    designTokens: null,
    seoReview: emptySeoReview,
    analyticsReview: emptyAnalyticsReview,
    editorialReview:
      params.editorialReview ??
      ({
        packs: [],
        signals: {
          hasBlogCollection: false,
          hasContactFlow: false,
        },
      } satisfies EditorialReview),
    businessWorkflowReview:
      params.businessWorkflowReview ??
      ({
        packs: [],
        signals: {
          hasLeadCapture: false,
          hasBookingFlow: false,
          hasCrmSync: false,
        },
      } satisfies BusinessWorkflowReview),
    sanityIssues: [],
    sanityErrors: [],
    sanityWarnings: [],
    imageValidation: null,
    resolvedDemoUrl:
      params.resolvedDemoUrl === undefined
        ? "https://preview.example/ver_test"
        : params.resolvedDemoUrl,
    runtimePreviewState: params.runtimePreviewState ?? null,
  });
}

describe("post-checks-results", () => {
  it("limits editorial labels and suggested prompts to the same top 4 packs", () => {
    const artifacts = buildArtifacts({
      editorialReview: {
        packs: [
          { id: "hero", label: "Hero", reason: "r1", suggestedPrompt: "p1" },
          { id: "services", label: "Services", reason: "r2", suggestedPrompt: "p2" },
          { id: "testimonials", label: "Testimonials", reason: "r3", suggestedPrompt: "p3" },
          { id: "faq", label: "FAQ", reason: "r4", suggestedPrompt: "p4" },
          { id: "contact", label: "Contact", reason: "r5", suggestedPrompt: "p5" },
        ],
        signals: {
          hasBlogCollection: false,
          hasContactFlow: true,
        },
      },
    });

    expect(artifacts.output.editorialSummary.labels).toEqual([
      "Hero",
      "Services",
      "Testimonials",
      "FAQ",
    ]);
    expect(artifacts.output.editorialSummary.suggestedPrompts).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
    ]);
    expect(artifacts.output.editorialSummary.labels).toHaveLength(
      artifacts.output.editorialSummary.suggestedPrompts.length,
    );
  });

  it("limits business workflow labels and suggested prompts to the same top 4 packs", () => {
    const artifacts = buildArtifacts({
      businessWorkflowReview: {
        packs: [
          {
            id: "lead-capture",
            label: "Lead capture",
            description: "d1",
            suggestedPrompt: "bp1",
            envVars: [],
            recommendedIntegrations: ["HubSpot"],
            verificationChecklist: [],
            reasons: [],
          },
          {
            id: "booking",
            label: "Booking",
            description: "d2",
            suggestedPrompt: "bp2",
            envVars: [],
            recommendedIntegrations: ["Calendly"],
            verificationChecklist: [],
            reasons: [],
          },
          {
            id: "crm-sync",
            label: "CRM sync",
            description: "d3",
            suggestedPrompt: "bp3",
            envVars: [],
            recommendedIntegrations: ["HubSpot"],
            verificationChecklist: [],
            reasons: [],
          },
          {
            id: "newsletter",
            label: "Newsletter",
            description: "d4",
            suggestedPrompt: "bp4",
            envVars: [],
            recommendedIntegrations: ["Mailchimp"],
            verificationChecklist: [],
            reasons: [],
          },
          {
            id: "quote-request",
            label: "Quote request",
            description: "d5",
            suggestedPrompt: "bp5",
            envVars: [],
            recommendedIntegrations: ["Pipedrive"],
            verificationChecklist: [],
            reasons: [],
          },
        ],
        signals: {
          hasLeadCapture: true,
          hasBookingFlow: true,
          hasCrmSync: true,
        },
      },
    });

    expect(artifacts.output.businessWorkflowSummary.labels).toEqual([
      "Lead capture",
      "Booking",
      "CRM sync",
      "Newsletter",
    ]);
    expect(artifacts.output.businessWorkflowSummary.suggestedPrompts).toEqual([
      "bp1",
      "bp2",
      "bp3",
      "bp4",
    ]);
    expect(artifacts.output.businessWorkflowSummary.labels).toHaveLength(
      artifacts.output.businessWorkflowSummary.suggestedPrompts.length,
    );
  });

  it("does not queue autofix when runtime preview is still pending after clean static preflight", () => {
    const artifacts = buildArtifacts({
      resolvedDemoUrl: null,
      runtimePreviewState: "pending",
      preflight: {
        previewBlocked: false,
        verificationBlocked: false,
        previewBlockingReason: null,
      },
    });

    expect(artifacts.autoFixReasons).toEqual([]);
    expect(artifacts.output.summary.autoFixQueued).toBe(false);
    expect(artifacts.output.summary.qualityTier).toBe("preview");
    expect(artifacts.output.steps).toContain(
      "Runtime preview invantar sandbox-start innan riktig Next-runtime visas.",
    );
  });

  it("queues autofix when critical SEO codes are present", () => {
    const criticalSeo: SeoReview = {
      passed: false,
      issues: [
        {
          severity: "warning",
          code: "missing-metadata",
          message: "Layouten saknar export av metadata.",
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
        homeH1Count: null,
      },
    };
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
      seoReview: criticalSeo,
      analyticsReview: emptyAnalyticsReview,
      editorialReview: {
        packs: [],
        signals: { hasBlogCollection: false, hasContactFlow: false },
      },
      businessWorkflowReview: {
        packs: [],
        signals: { hasLeadCapture: false, hasBookingFlow: false, hasCrmSync: false },
      },
      sanityIssues: [],
      sanityErrors: [],
      sanityWarnings: [],
      imageValidation: null,
      resolvedDemoUrl: "https://preview.example/ver_test",
    });
    expect(artifacts.autoFixReasons.some((r) => r.includes("SEO"))).toBe(true);
    expect(artifacts.output.summary.autoFixQueued).toBe(true);
  });

  it("treats skipped sandbox runtime as non-blocking without claiming it is still pending", () => {
    const artifacts = buildArtifacts({
      resolvedDemoUrl: null,
      runtimePreviewState: "skipped",
      preflight: {
        previewBlocked: false,
        verificationBlocked: false,
        previewBlockingReason: null,
      },
    });

    expect(artifacts.autoFixReasons).toEqual([]);
    expect(artifacts.output.summary.qualityTier).toBe("preview");
    expect(artifacts.output.steps).toContain(
      "Runtime preview kunde inte startas automatiskt i sandbox, men den statiska versionen passerade.",
    );
  });
});
