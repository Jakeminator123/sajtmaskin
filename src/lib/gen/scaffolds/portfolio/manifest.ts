import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const portfolioManifest: ScaffoldManifest = {
  id: "portfolio",
  label: "Portfolio",
  description:
    "Personal portfolio starter with intro, selected work, writing, credibility, and contact sections.",
  siteKind: "editorial",
  complexity: "medium",
  structureProfile: "showcase-site",
  contentProfile: "creator-portfolio",
  features: ["gallery", "project-cases", "contact-cta"],
  allowedBuildIntents: ["website", "template"],
  tags: [
    "portfolio",
    "personal",
    "creative",
    "designer",
    "developer",
    "photographer",
    "consultant",
    "agency",
  ],
  promptHints: [
    "Use this scaffold for personal brands, creative professionals, studios, consultants, and lightweight agency profiles.",
    "Keep the portfolio rhythm: intro, selected work, experience or credibility, writing, and contact.",
    "Adapt the visuals and tone to the person or studio rather than turning it into a generic company landing page.",
  ],
  qualityChecklist: [
    "Featured work, credibility, and contact should stay more prominent than generic marketing sections.",
    "Visual tone, imagery, and copy should feel specific to the person, studio, or discipline.",
    "Project cards or case studies should read like real work, not placeholder service blurbs.",
  ],
  research: {
    upgradeTargets: [
      "Add richer case-study detail pages with challenge, process, and outcome blocks.",
      "Add service boundaries and availability messaging that keeps the personal voice.",
      "Add social proof blocks (selected clients, recognitions, testimonials) without turning corporate.",
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
  files: loadScaffoldFiles("portfolio"),
};
