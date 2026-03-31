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
}) {
  return buildPostCheckArtifacts({
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
    resolvedDemoUrl: "https://preview.example/ver_test",
  });
}

describe("post-checks-results", () => {
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
          suggestedScaffoldFamily: "saas-landing",
          failureType: "blocking-preflight",
          reason: "Preflight-blockeringen tyder på att E-handel kan vara en svag scaffold-fit.",
          source: "heuristic",
          confidence: "medium",
        },
        routePlan: {
          source: "brief",
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
      analyticsReview: emptyAnalyticsReview,
      editorialReview: { packs: [], signals: { hasBlogCollection: false, hasContactFlow: false } },
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

    expect(artifacts.autoFixReasons).toEqual([]);
    expect(artifacts.warningReasons).toEqual(
      expect.arrayContaining(["misstänkt scaffold-mismatch", "planerade routes saknas"]),
    );
  });

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
});
