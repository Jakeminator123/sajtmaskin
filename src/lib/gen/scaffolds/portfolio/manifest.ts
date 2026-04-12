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
    referenceTemplates: [
      { id: "portfolio-magic-portfolio-for-next-js", title: "Magic Portfolio for Next.js", categorySlug: "portfolio", qualityScore: 92, strengths: ["verified Next.js codebase", "editorial content hierarchy", "project showcase patterns"] },
      { id: "portfolio-next-js-portfolio-with-pageview-counter", title: "Next.js Portfolio with Pageview Counter", categorySlug: "portfolio", qualityScore: 92, strengths: ["verified Next.js codebase", "analytics integration", "personal brand layout"] },
      { id: "portfolio-nim-minimalist-personal-site", title: "Nim — Minimalist Personal Site", categorySlug: "portfolio", qualityScore: 92, strengths: ["verified Next.js codebase", "minimalist design approach", "personal voice layout"] },
    ],
  },
  files: loadScaffoldFiles("portfolio"),
};
