import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const projektBasAppManifest: ScaffoldManifest = {
  id: "projekt-bas-app",
  label: "Projekt bas-app",
  description:
    "Minimal app-bas för Scaffold: Av i fritext — körbar Next.js-start utan färdig produktstruktur.",
  siteKind: "app",
  complexity: "simple",
  structureProfile: "starter-app",
  contentProfile: "generic",
  features: ["routing-basics", "component-ready"],
  allowedBuildIntents: ["app", "website"],
  tags: ["starter", "minimal", "bas", "app", "scaffold-off"],
  promptHints: [
    "This is a minimal Next.js app baseline used when the user picks Scaffold: Av (not templates).",
    "Do not preserve placeholder marketing or dashboard sections — invent structure from the user prompt.",
    "You may add routes, components, packages and UI freely; keep App Router + globals.css tokens intact.",
  ],
  qualityChecklist: [
    "Keep the starter minimal: layout, page, and globals.css should stay intact as the baseline.",
    "Shape the product from the user prompt / brief — do not invent a sidebar/dashboard unless asked.",
    "Do not remove @theme inline tokens, path aliases, or the dark baseline without a clear replacement.",
  ],
  research: {
    upgradeTargets: [
      "Add only the routes and components the prompt actually needs.",
      "Introduce shared UI patterns after the first working screen exists.",
    ],
    referenceTemplates: [],
  },
  // Pure move of the former getScaffoldDefaultRoutes switch (route-plan
  // planning-helpers): this scaffold contributed no default routes.
  routeContract: {
    requiredRoutes: [],
    optionalRoutes: [],
    declaredRoutePaths: [],
    dynamicRoutePatterns: [],
  },
  files: loadScaffoldFiles("projekt-bas-app"),
};
