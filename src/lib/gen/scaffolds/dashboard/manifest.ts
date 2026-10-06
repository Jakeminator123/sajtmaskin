import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const dashboardManifest: ScaffoldManifest = {
  id: "dashboard",
  label: "Dashboard",
  description:
    "Demo analytics dashboard with sidebar, sample KPI cards, tables, and chart placeholders. Authentication, live data, and settings persistence require integration.",
  siteKind: "app",
  complexity: "advanced",
  structureProfile: "dashboard-app",
  contentProfile: "operations-analytics",
  features: ["navigation-shell", "tables", "charts"],
  allowedBuildIntents: ["app"],
  tags: [
    "dashboard",
    "analytics",
    "admin",
    "stats",
    "metrics",
    "panel",
    "overview",
    "instrumentpanel",
    "statistik",
  ],
  promptHints: [
    "Use this scaffold for analytics-heavy dashboards, KPI monitoring, admin overviews, and data operations.",
    "Keep the sidebar navigation, stats cards, trend sections, and chart surfaces. Use domain-specific examples visibly labelled as demo until connected to verified data.",
    "Treat this as an analytics cockpit rather than a CRUD workspace. Add deeper charts and reporting detail where needed.",
    "Preserve facts provided by the brief or verified sources; never invent live KPI results, customer activity, ratings, or certifications.",
    "Authentication, settings persistence, export, scheduling, and provider actions are not connected. Keep unavailable actions disabled and visibly explain the boundary until a real integration exists.",
  ],
  qualityChecklist: [
    "The layout should remain app-like, dense, and operational rather than turning into a marketing page.",
    "Sidebar, top summary cards, and main data surfaces should match the user's actual domain and workflows.",
    "Static tables, charts, users, and activity must remain visibly labelled as demo, including on secondary routes.",
    "Sample identity is not an authenticated session. Settings fields are previews, not saved preferences, until persistence is implemented.",
  ],
  research: {
    upgradeTargets: [
      "Add a date range selector that drives KPI cards and chart datasets.",
      "Include segmented analytics views (traffic, conversion, retention) with tabs.",
      "Add export actions (CSV/PDF) and report scheduling placeholders.",
    ],
  },
  // Pure move of the former getScaffoldDefaultRoutes switch (route-plan
  // planning-helpers): /analytics and /settings were planned as optional,
  // and only when buildIntent was "app".
  // SM-048 (owner decision 2026-08-14): /users is declared (page file
  // exists, never planned) which also resolved its SM-042 gate drift. The
  // plan filter in finalize-merge drops unplanned route files; nav-sync
  // rewrites the `navSurface` sidebar to match, so no dead links remain.
  routeContract: {
    requiredRoutes: [],
    optionalRoutes: [
      {
        path: "/analytics",
        name: "Analytics",
        planIntent: "Dashboard apps benefit from an analytics or metrics route.",
        planOnlyForBuildIntents: ["app"],
      },
      {
        path: "/settings",
        name: "Settings",
        planIntent: "App shells should usually expose at least one management/settings route.",
        planOnlyForBuildIntents: ["app"],
      },
    ],
    declaredRoutePaths: ["/users"],
    dynamicRoutePatterns: [],
  },
  navSurface: "components/dashboard-sidebar.tsx",
  files: loadScaffoldFiles("dashboard"),
};
