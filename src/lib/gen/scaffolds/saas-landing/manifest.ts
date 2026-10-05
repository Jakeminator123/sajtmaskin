import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const saasLandingManifest: ScaffoldManifest = {
  id: "saas-landing",
  label: "SaaS Landing",
  description:
    "Product-led marketing starter with labelled sample metrics, example pricing and FAQ. Signup, billing and product integrations require a real connection.",
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
    "The full-width hero product preview sits under a centered headline and should stay visually product-led.",
    "Use testimonials, ratings, customer counts, certificates, customer logos and partner badges only when provided by the brief or verified sources. Otherwise omit the claim or label the content as example data; never invent customer identities or quotes.",
    "Label static metrics and pricing as demo/example data. Preserve verified facts from the brief, but never imply live metrics, connected signup/billing or implemented security features without a real integration.",
  ],
  qualityChecklist: [
    "Replace every [Produktnamn] placeholder with the real product name from the brief (header, footer, metadata, visible strings) — never ship the literal token.",
    "Pricing tiers use verified offers from the brief or visibly labelled example names, prices and features; plan selection stays disabled until connected.",
    "FAQ answers use supplied product facts, not invented rollout, free-tier, export or security promises.",
    "Static hero metrics remain visibly marked demo, never live data; verified product metrics may replace them when supplied.",
    "Feature icons and descriptions match the product's value proposition.",
    "Dark theme colors adapted to the product's brand, not left as default blue.",
  ],
  research: {
    upgradeTargets: [
      "Add a product screenshot or animated preview in the hero dashboard card.",
      "Include customer logos or integration partner badges only when supplied or verified; otherwise omit the trust bar.",
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
