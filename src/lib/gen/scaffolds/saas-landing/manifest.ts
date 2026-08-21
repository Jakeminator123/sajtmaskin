import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const saasLandingManifest: ScaffoldManifest = {
  id: "saas-landing",
  label: "SaaS Landing",
  description:
    "Product-led marketing starter with feature narrative, dashboard preview, pricing, FAQ, and conversion-ready sections.",
  siteKind: "marketing",
  complexity: "medium",
  structureProfile: "multi-section-marketing",
  contentProfile: "saas-growth",
  features: ["pricing", "feature-grid", "comparison", "cta"],
  allowedBuildIntents: ["website", "template"],
  tags: ["saas", "software", "platform", "pricing", "subscription", "dashboard", "product", "b2b"],
  promptHints: [
    "Use this scaffold when the prompt is clearly about software, subscriptions, dashboards, or B2B products.",
    "Keep the product narrative: problem, product value, feature panels, pricing, FAQ, and final CTA.",
    "The right-side hero card is a product preview slot and should stay visually product-led.",
  ],
  qualityChecklist: [
    "Replace every {{PRODUCT_NAME}} placeholder with the real product name from the brief (header, footer, metadata, visible strings) — never ship the literal token.",
    "Pricing tiers have realistic names, prices, and feature lists matching the prompt.",
    "FAQ answers are specific to the user's product, not generic scaffold text.",
    "Hero dashboard preview card reflects the actual product's metrics/domain.",
    "Feature icons and descriptions match the product's value proposition.",
    "Dark theme colors adapted to the product's brand, not left as default blue.",
  ],
  research: {
    upgradeTargets: [
      "Add a product screenshot or animated preview in the hero dashboard card.",
      "Include a trust bar with customer logos or integration partner badges.",
      "Add toggle for monthly/annual pricing with discount indicator.",
      "Include comparison table for pricing tiers on larger screens.",
      "Generate structured data (JSON-LD SoftwareApplication) for SEO.",
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
  // The header nav is in-page anchors only (#features, #pricing, #faq);
  // nav-sync never touches anchors, so this stays a no-op until a real
  // internal page link appears in the header.
  navSurface: "components/marketing-header.tsx",
  files: loadScaffoldFiles("saas-landing"),
};
