import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const baseNextjsManifest: ScaffoldManifest = {
  id: "base-nextjs",
  label: "Base Next.js",
  description:
    "Minimal Next.js starter with Tailwind, App Router, and dark theme.",
  siteKind: "marketing",
  complexity: "simple",
  structureProfile: "starter-nextjs",
  contentProfile: "generic",
  features: ["routing-basics", "seo-metadata", "component-ready"],
  allowedBuildIntents: ["website", "template"],
  tags: ["starter", "minimal", "nextjs", "tailwind", "shadcn", "clean", "boilerplate", "grundmall"],
  promptHints: [
    "Keep it simple. This is a minimal base — add sections as needed.",
    "Preserve the starter shape: App Router, globals.css tokens, and a clean baseline that can be extended safely.",
  ],
  qualityChecklist: [
    "Keep the starter minimal and easy to extend without unnecessary sections.",
    "Preserve App Router basics: layout, page, and globals.css should stay intact.",
    "Do not remove @theme inline tokens, path aliases, or the dark baseline without a clear replacement.",
  ],
  research: {
    upgradeTargets: [
      "Add a tiny reusable section system (hero + feature cards) while keeping starter simplicity.",
      "Introduce metadata and OG defaults tied to brand/site context from the prompt.",
      "Add one optional secondary route as a pattern for safe multi-page expansion.",
    ],
    referenceTemplates: [
      { id: "starter-next-js-app-router-playground", title: "Next.js App Router Playground", categorySlug: "starter", qualityScore: 94, strengths: ["verified Next.js codebase", "App Router structure", "clean minimal baseline"] },
      { id: "starter-next-js-motherduck-wasm-minimal", title: "Next.js Motherduck WASM Minimal", categorySlug: "starter", qualityScore: 92, strengths: ["verified Next.js codebase", "minimal starter pattern", "modern tooling"] },
      { id: "starter-sanity-next-js-clean-app", title: "Sanity Next.js Clean App", categorySlug: "starter", qualityScore: 90, strengths: ["verified Next.js codebase", "App Router structure", "clean project scaffold"] },
    ],
  },
  files: loadScaffoldFiles("base-nextjs"),
};
