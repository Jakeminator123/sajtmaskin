import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const contentSiteManifest: ScaffoldManifest = {
  id: "content-site",
  label: "Content Site",
  description:
    "Content-first website with hero, features, testimonials, and footer. Great for landing pages, portfolios, and blogs.",
  siteKind: "marketing",
  complexity: "medium",
  structureProfile: "content-marketing-site",
  contentProfile: "brand-storytelling",
  features: ["hero", "feature-sections", "testimonials", "cta"],
  allowedBuildIntents: ["website", "template"],
  tags: [
    "content-site",
    "brand-site",
    "multi-page",
    "information",
    "about",
    "team",
    "features",
    "company",
    "agency",
    "service",
    "foretagssida",
    "informationssida",
  ],
  promptHints: [
    "This scaffold has a hero, features grid, testimonials, and footer.",
    "Modify the content and sections to match the user's business.",
    "Add or remove sections as needed. Keep the navigation and footer structure.",
    "Use Unsplash images where appropriate.",
    "For SaaS/software sites: include pricing tiers, feature comparison, trust signals, and clear CTAs.",
    "For company/brand sites: include hero, about, team, services, and contact sections.",
  ],
  qualityChecklist: [
    "The page should stay content-first and reusable rather than locking into one narrow business type.",
    "Navigation, hero, supporting sections, and footer should remain coherent after customization.",
    "Only add pricing, dashboard, or app-shell patterns when the prompt clearly asks for them.",
  ],
  research: {
    upgradeTargets: [
      "Add section variants (case studies, team, process) that can be toggled by domain.",
      "Add stronger CTA ladders (primary + secondary actions) across long pages.",
      "Add trust-signal modules (logos, results, testimonials) tied to business context.",
    ],
    referenceTemplates: [
      { id: "cms-next-js-waitlist-with-notion-cms", title: "Next.js Waitlist with Notion CMS", categorySlug: "cms", qualityScore: 96, strengths: ["verified Next.js codebase", "content-first hierarchy", "section composition"] },
      { id: "cms-basehub-marketing-website", title: "BaseHub Marketing Website", categorySlug: "cms", qualityScore: 88, strengths: ["verified Next.js codebase", "marketing page structure", "content blocks"] },
      { id: "cms-next-js-starter-for-wordpress-headless-cms", title: "Next.js Starter for WordPress Headless CMS", categorySlug: "cms", qualityScore: 88, strengths: ["verified Next.js codebase", "headless CMS pattern", "content rendering"] },
    ],
  },
  files: loadScaffoldFiles("content-site"),
};
