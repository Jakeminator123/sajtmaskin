import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const landingPageManifest: ScaffoldManifest = {
  id: "landing-page",
  label: "Landing Page",
  description:
    "Polished one-page or multi-section layout for local businesses, service companies, and product launches.",
  siteKind: "marketing",
  complexity: "medium",
  structureProfile: "one-page-marketing",
  contentProfile: "service-business",
  features: ["hero", "trust-signals", "cta"],
  allowedBuildIntents: ["website", "template"],
  tags: [
    "landing",
    "marketing",
    "company",
    "agency",
    "services",
    "startup",
    "business",
    "one-page",
  ],
  promptHints: [
    "Use this scaffold for local businesses, company sites, campaign pages, and service-led websites.",
    "Keep the overall rhythm: strong hero, content sections that match the actual business, and a clear CTA.",
    "Replace all scaffold copy, section types, and imagery to genuinely reflect the user's business — a bakery should feel warm, a law firm authoritative, a startup energetic.",
    "Sub-routes (slug pages, individual blog posts, om-sidor, sitemap-pages) MUST stand on their own — even though this scaffold is one-page-marketing, never auto-redirect from a sub-route back to '/'. Do NOT call router.push('/'), redirect('/'), or window.location.href = '/' inside a sub-route page or its client components. If the user lands on /afrikanska-bonor, render that page in full.",
  ],
  qualityChecklist: [
    "Hero headline is specific to user's business — not generic marketing filler.",
    "All bracket placeholders replaced with real, relevant content.",
    "CTA button text matches what the business actually offers.",
    "Testimonial section uses realistic names/roles, not [Kundens namn].",
    "Color palette adapted from neutral grays to a vivid, brand-appropriate scheme.",
    "At least 3 distinct content sections with alternating visual rhythm.",
  ],
  research: {
    upgradeTargets: [
      "Add a stats/social-proof row with concrete numbers relevant to the user's industry.",
      "Include a sticky CTA or floating action when the user scrolls past the hero.",
      "Add smooth scroll-to-section behavior for in-page navigation links.",
      "Use next/image with proper sizing for all hero and section images.",
      "Generate metadata with title, description, and OG tags matching the user's business.",
    ],
  },
  // Pure move of the former getScaffoldDefaultRoutes switch (route-plan
  // planning-helpers): this scaffold contributed no default routes.
  routeContract: {
    requiredRoutes: [],
    optionalRoutes: [],
    declaredRoutePaths: [],
    dynamicRoutePatterns: [],
  },
  // The header nav is in-page anchors only (#erbjudande, #om, #kontakt);
  // nav-sync never touches anchors, so this stays a no-op until a real
  // internal page link appears in the header.
  navSurface: "components/site-header.tsx",
  files: loadScaffoldFiles("landing-page"),
};
